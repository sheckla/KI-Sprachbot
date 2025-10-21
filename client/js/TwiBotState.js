/*****************************
 * State handler for AI-Assistant "twi-bot"
 *  21.10.2025 Daniel Graf
 *****************************/
import { Cooldown } from "./Cooldown.js";

const HOT_LISTEN_MS = 5000;
const PUSH_TO_TALK_COOLDOWN_MS = 1000;
export class TwiBotState {
    warmedUpCooldown = new Cooldown(HOT_LISTEN_MS);
    pushToTalkCooldown = new Cooldown(PUSH_TO_TALK_COOLDOWN_MS);
    pipelineBlocked = false;
    readyToListen = true;
    warmedUp = false;

    setPipelineBlocked(state) {
        this.pipelineBlocked = state;
        document.getElementById("push-to-talk-begin").disabled = state;
    }

    setReadyToListen(state) {
        this.readyToListen = state;
    }

    setWarmedUp(state) {
        this.warmedUp = state;
        const elem = document.getElementById("push-to-talk-begin");
        if (state) {
            elem.classList.add("push-to-talk-standby");
            elem.innerText = "Weiterreden...";
        } else {
            elem.classList.remove("push-to-talk-standby");
            elem.innerText = "Push-to-Talk";
        }
    }

}
