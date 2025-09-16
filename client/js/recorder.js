let userMediaRecorderStream = null;
let userMediaRecorder = null;
let userMediaRecorderChunks = [];
let micIsRecording = false;
const pttButton = document.getElementById('push-to-talk-begin')

/*****************************
 * Init PTS into Pipelin
 *****************************/
async function recordAudio() {
  // already recording -> stop recording
  if (Recorder.isRecording) {
    // userMediaRecorder.stop();
    const result = await Recorder.stop()
    stopTimer();
    pttButton.classList.remove('push-to-talk-active');
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(result.file);
    fileInput.files = dataTransfer.files;
    const audioUrl = URL.createObjectURL(result.blob);
    fileInputPlayer.src = audioUrl;
    //fileInputPlayer.load();

    // when file ready => start pipeline
    window.onAudioReady?.(result.blob, audioUrl);
    startPipeline();
    return;
  }
  await Recorder.start();
  startTimer();
  pttButton.classList.add('push-to-talk-active');
  return;
}

function pushToFileInput(blob, file) {

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
