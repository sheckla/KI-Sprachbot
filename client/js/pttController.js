/*****************************
 * Push-To-Talk Pipeline runtime controller
 * - Start/Stop recording
 * - Show recording time
 * - Push recorded audio into file-input
 * - Send audio to pipeline entry point
 *  16.09.2025 Daniel Graf
 *****************************/
let pttButton = document.getElementById('push-to-talk-begin')

/*****************************
 * Init PTS into Pipelin
 *****************************/
async function initPushToTalk() {
  // already recording -> stop recording
  if (Recorder.isRecording) {
    stopPushToTalk();
  }
  await Recorder.start();
  startTimer();
  pttButton.classList.add('push-to-talk-active');
  return;
}


async function stopPushToTalk() {
  const result = await Recorder.stop()
  stopTimer();
  pttButton.classList.remove('push-to-talk-active');

  // push recording into file-input!
  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(result.file);
  fileInput.files = dataTransfer.files;

  // push recording into File-input-player
  const audioUrl = URL.createObjectURL(result.blob);

  document.getElementById("inputPlayer").src = audioUrl;

  // when file ready => start pipeline
  window.onAudioReady?.(result.blob, audioUrl);
  startPipeline();
  return;
}

/*****************************
 *  Start ms-timer when activating Push-to-Talk
 *****************************/
async function startTimer() {
  pttStartTime = performance.now();
  function timeStep() {
    const elapsed = (performance.now() - pttStartTime) / 1000.0;
    if (Recorder.isRecording) {
      document.getElementById("push-to-talk-begin").textContent = elapsed.toFixed(1) + " s";
      animationFrameId = requestAnimationFrame(timeStep);
    }

  }
  timeStep();
}
/*****************************
 *  Reset Timer and animationFrameId
 *****************************/
async function stopTimer() {
  if (animationFrameId) cancelAnimationFrame(animationFrameId);
  animationFrameId = null;
  document.getElementById("push-to-talk-begin").textContent = "Push-to-Talk";
}
