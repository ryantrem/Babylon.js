const SyncPromiseId = Symbol("SyncPromiseId");

type PendingState<T> = {
    status: "pending";
    promise: PromiseLike<T>;
};

type ResolvedState<T> = {
    status: "resolved";
    result: T;
};

type RejectedState = {
    status: "rejected";
    error: unknown;
};

type State<T> = PendingState<T> | ResolvedState<T> | RejectedState;

function IsPromiseLike(value: unknown | PromiseLike<unknown> | undefined | null): value is PromiseLike<unknown> {
    if (value == null) {
        return false;
    }
    // eslint-disable-next-line github/no-then
    return !!(value as PromiseLike<unknown>).then;
}

function IsSyncPromise(promise: PromiseLike<unknown>): promise is SyncPromise<unknown> {
    return !!(promise as SyncPromise<unknown>)[SyncPromiseId];
}

function IsSyncPromises(values: readonly unknown[]): values is readonly SyncPromise<unknown>[] {
    return values.every((value) => IsPromiseLike(value) && IsSyncPromise(value));
}

export class SyncPromise<T> implements PromiseLike<T> {
    private readonly [SyncPromiseId] = SyncPromiseId;

    public static Resolve(): PromiseLike<void>;
    public static Resolve<T>(result: T): PromiseLike<T>;
    public static Resolve<T>(result?: T): PromiseLike<T> {
        return new SyncPromise({ status: "resolved", result: result as T });
    }

    public static Reject(error: unknown): PromiseLike<never> {
        return new SyncPromise({ status: "rejected", error });
    }

    public static Wrap<T = unknown>(promise: PromiseLike<T>): PromiseLike<T> {
        if (IsSyncPromise(promise)) {
            return promise;
        } else {
            return new SyncPromise({ status: "pending", promise });
        }
    }

    public static All<T extends readonly unknown[] | []>(values: T): PromiseLike<{ -readonly [P in keyof T]: Awaited<T[P]> }> {
        if (IsSyncPromises(values)) {
            let anyPending = false;
            const results: unknown[] = [];
            for (const value of values) {
                const syncPromise = value as SyncPromise<unknown>;
                if (syncPromise._state.status === "pending") {
                    anyPending = true;
                    break;
                } else if (syncPromise._state.status === "resolved") {
                    results.push(syncPromise._state.result);
                } else {
                    return SyncPromise.Reject(syncPromise._state.error);
                }
            }

            if (!anyPending) {
                return new SyncPromise({ status: "resolved", result: results as { -readonly [P in keyof T]: Awaited<T[P]> } });
            }
        }

        return Promise.all(values);
    }

    private constructor(private _state: State<T>) {
        if (this._state.status === "pending") {
            // eslint-disable-next-line github/no-then
            this._state.promise.then(
                (result) => {
                    this._state = {
                        status: "resolved",
                        result,
                    };
                },
                (error: unknown) => {
                    this._state = {
                        status: "rejected",
                        error,
                    };
                }
            );
        }
    }

    // eslint-disable-next-line @typescript-eslint/naming-convention
    public then<TResult1 = T, TResult2 = never>(
        onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
    ): PromiseLike<TResult1 | TResult2> {
        if (this._state.status === "pending") {
            // eslint-disable-next-line github/no-then
            return this._state.promise.then(onfulfilled, onrejected);
        } else {
            const state = this._state;
            const continuation = state.status === "resolved" ? (onfulfilled ? () => onfulfilled(state.result) : undefined) : onrejected ? () => onrejected(state.error) : undefined;
            if (continuation) {
                try {
                    const result = continuation();
                    if (IsPromiseLike(result)) {
                        result;
                        return SyncPromise.Wrap<TResult1 | TResult2>(result);
                    } else {
                        return new SyncPromise({ status: "resolved", result });
                    }
                } catch (error: unknown) {
                    return new SyncPromise({ status: "rejected", error });
                }
            } else {
                return this as PromiseLike<TResult1 | TResult2>;
            }
        }
    }
}
