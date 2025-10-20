export class TwiBotState {
    pipelineBlocked = false;
    readyToListen = true;


    setPipelineBlocked(state) {
        this.pipelineBlocked = state;
        document.getElementById("push-to-talk-begin").disabled = state;
    }

    setReadyToListen(state) {
        this.readyToListen = state;
    }

}
