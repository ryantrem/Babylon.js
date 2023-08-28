import type { FlowGraphSignalConnection } from "../../flowGraphSignalConnection";
import type { FlowGraphDataConnection } from "../../flowGraphDataConnection";
import { FlowGraphWithOnDoneExecutionBlock } from "core/FlowGraph/flowGraphWithOnDoneExecutionBlock";
import type { FlowGraphContext } from "../../flowGraphContext";
import { FlowGraphValueType } from "core/FlowGraph/flowGraphTypes";

/**
 * @experimental
 * Block that executes a loop.
 */
export class FlowGraphForLoopBlock extends FlowGraphWithOnDoneExecutionBlock {
    /**
     * The start index of the loop.
     */
    public readonly startIndex: FlowGraphDataConnection;
    /**
     * The end index of the loop.
     */
    public readonly endIndex: FlowGraphDataConnection;
    /**
     * The step of the loop.
     */
    public readonly step: FlowGraphDataConnection;
    /**
     * The current index of the loop.
     */
    public readonly index: FlowGraphDataConnection;
    /**
     * The signal that is activated when the loop body is executed.
     */
    public readonly onLoop: FlowGraphSignalConnection;
    /**
     * The signal that is activated when the loop is done.
     */
    public readonly onDone: FlowGraphSignalConnection;

    public constructor() {
        super();

        this.startIndex = this._registerDataInput("startIndex", FlowGraphValueType.Float);
        this.endIndex = this._registerDataInput("endIndex", FlowGraphValueType.Float);
        this.step = this._registerDataInput("step", FlowGraphValueType.Float);
        this.step.value = 1;

        this.index = this._registerDataOutput("index", FlowGraphValueType.Float);
        this.onLoop = this._registerSignalOutput("onLoop");
        this.onDone = this._registerSignalOutput("onDone");
    }

    private _executeLoop(context: FlowGraphContext) {
        let index = context._getExecutionVariable(this, "index");
        const endIndex = context._getExecutionVariable(this, "endIndex");
        if (index < endIndex) {
            this.index.value = index;
            this.onLoop._activateSignal(context);
            const step = context._getExecutionVariable(this, "step");
            index += step;
            context._setExecutionVariable(this, "index", index);
            this._executeLoop(context);
        } else {
            this.onDone._activateSignal(context);
        }
    }

    /**
     * @internal
     */
    public _execute(context: FlowGraphContext): void {
        const index = this.startIndex.getValue(context);
        const endIndex = this.endIndex.getValue(context);
        const step = this.step.getValue(context);
        context._setExecutionVariable(this, "index", index);
        context._setExecutionVariable(this, "endIndex", endIndex);
        context._setExecutionVariable(this, "step", step);
        this._executeLoop(context);
    }
}
