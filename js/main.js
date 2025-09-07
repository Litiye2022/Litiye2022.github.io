let bleDevice, gattServer;
let epdService, epdCharacteristic;
let startTime, msgIndex, appVersion;
let canvas, ctx, textDecoder;
let firmwareArray = "";
let isErase = 0;
const EpdCmd = {
  SET_PINS: 0x00,
  INIT: 0x01,
  CLEAR: 0x02,
  SEND_CMD: 0x03,
  SEND_DATA: 0x04,
  REFRESH: 0x05,
  SLEEP: 0x06,

  SET_TIME: 0x20,

  WRITE_IMG: 0x30, // v1.6

  SET_CONFIG: 0x90,
  SYS_RESET: 0x91,
  SYS_SLEEP: 0x92,
  CFG_ERASE: 0x99,
  EPD_CMD_OTA_ERASE: 0xA1,
  EPD_CMD_OTA_WRITE: 0xA2,
  EPD_CMD_OTA_WRAM: 0xA3,
  EPD_CMD_OTA_CRC: 0xA6,
  EPD_CMD_OTA_FINSH: 0xA7,
  EPD_CMD_BOOT_ENTER: 0xF8,
};

const canvasSizes = [
  { name: '1.54_152_152', width: 152, height: 152 },
  { name: '1.54_200_200', width: 200, height: 200 },
  { name: '2.13_212_104', width: 212, height: 104 },
  { name: '2.13_250_122', width: 250, height: 122 },
  { name: '2.66_296_152', width: 296, height: 152 },
  { name: '2.9_296_128', width: 296, height: 128 },
  { name: '2.9_384_168', width: 384, height: 168 },
  { name: '3.5_384_184', width: 384, height: 184 },
  { name: '3.7_416_240', width: 416, height: 240 },
  { name: '3.97_800_480', width: 800, height: 480 },
  { name: '4.2_400_300', width: 400, height: 300 },
  { name: '5.79_792_272', width: 792, height: 272 },
  { name: '7.5_800_480', width: 800, height: 480 },
  { name: '5.83_600_448', width: 600, height: 448 },
  { name: '7.5_640_384', width: 640, height: 384 },
  { name: '10.2_960_640', width: 960, height: 640 },
  { name: '10.85_1360_480', width: 1360, height: 480 },
  { name: '11.6_960_640', width: 960, height: 640 },
  { name: '4E_600_400', width: 600, height: 400 },
  { name: '7.3E6', width: 480, height: 800 }
];

function delay(delayInms) {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve(2);
    }, delayInms);
  });
}

function hex2bytes(hex) {
  for (var bytes = [], c = 0; c < hex.length; c += 2)
    bytes.push(parseInt(hex.substr(c, 2), 16));
  return new Uint8Array(bytes);
}

function bytes2hex(data) {
  return new Uint8Array(data).reduce(
    function (memo, i) {
      return memo + ("0" + i.toString(16)).slice(-2);
    }, "");
}

function intToHex(intIn) {
  let stringOut = ("0000" + intIn.toString(16)).substr(-4)
  return stringOut.substring(2, 4) + stringOut.substring(0, 2);
}
function decimalToHex(d, padding) {
  var hex = Number(d).toString(16);
  padding = typeof (padding) === "undefined" || padding === null ? padding = 2 : padding;

  while (hex.length < padding) {
    hex = "0" + hex;
  }

  return hex;
}
function resetVariables() {
  gattServer = null;
  epdService = null;
  epdCharacteristic = null;
  document.getElementById("log").value = '';
}

async function write(cmd, data, withResponse = true) {
  if (!epdCharacteristic) {
    addLog("服务不可用，请检查蓝牙连接");
    return false;
  }
  let payload = [cmd];
  if (data) {
    if (typeof data == 'string') data = hex2bytes(data);
    if (data instanceof Uint8Array) data = Array.from(data);
    payload.push(...data)
  }
  addLog(bytes2hex(payload), '⇑');
  try {
    if (withResponse)
      await epdCharacteristic.writeValueWithResponse(Uint8Array.from(payload));
    else
      await epdCharacteristic.writeValueWithoutResponse(Uint8Array.from(payload));
  } catch (e) {
    console.error(e);
    if (e.message) addLog("write: " + e.message);
    return false;
  }
  return true;
}
async function enterboot() {

  await write(EpdCmd.EPD_CMD_BOOT_ENTER, "00", true);

}

async function eraseFwArea() {
  var fwAreaSize = firmwareArray.length / 2;
  console.log("fwAreaSize: " + fwAreaSize);
  var fwCurAddress = 0;
  while (fwCurAddress < fwAreaSize) {
    hex_address = decimalToHex(fwCurAddress, 8);
    setOTAStatus("Erasing block: " + hex_address);
    isErase = 0;
    await write(EpdCmd.EPD_CMD_OTA_ERASE, hex_address, true);
    fwCurAddress += 0x1000;
    let timeout = 40;
    do {
      await delay(5)
      timeout -= 1;
      if (timeout == 0) {
        break;
      }
    } while (isErase == 0)
  }


}
async function sendPart(address, data) {
  hex_address = decimalToHex(address, 8);
  var part_len = 480;
  while (data.length) {
    var cur_part_len = part_len;
    if (data.length < part_len)
      cur_part_len = data.length;
    var data_part = data.substring(0, cur_part_len);
    console.log("Part: " + data_part);
    data = data.substring(cur_part_len);
    console.log("Sub Part: " + decimalToHex(EpdCmd.EPD_CMD_OTA_WRAM, 1) + data_part);
    await write(EpdCmd.EPD_CMD_OTA_WRAM, data_part, false);
    fwBytesTransmited += cur_part_len;
    console.log("fwBytesTransmited: " + fwBytesTransmited);
    setOTAStatus('Current part: ' + fwBytesTransmited / 2 + " All: " + fwSizeComplete / 2 + " Time: " + (new Date().getTime() - startTime) / 1000.0 + "s");
  }
  await write(EpdCmd.EPD_CMD_OTA_WRITE, hex_address, true);
  console.log("Writing bank: " + hex_address);
}


async function writeImage(data, step = 'bw') {
  const chunkSize = document.getElementById('mtusize').value - 2;
  const interleavedCount = document.getElementById('interleavedcount').value;
  const count = Math.round(data.length / chunkSize);
  let chunkIdx = 0;
  let noReplyCount = interleavedCount;

  for (let i = 0; i < data.length; i += chunkSize) {
    let currentTime = (new Date().getTime() - startTime) / 1000.0;
    setStatus(`${step == 'bw' ? '黑白' : '颜色'}块: ${chunkIdx + 1}/${count + 1}, 总用时: ${currentTime}s`);
    const payload = [
      (step == 'bw' ? 0x0F : 0x00) | (i == 0 ? 0x00 : 0xF0),
      ...data.slice(i, i + chunkSize),
    ];
    if (noReplyCount > 0) {
      await write(EpdCmd.WRITE_IMG, payload, false);
      noReplyCount--;
    } else {
      await write(EpdCmd.WRITE_IMG, payload, true);
      noReplyCount = interleavedCount;
    }
    chunkIdx++;
  }
}

async function setDriver() {
  await write(EpdCmd.SET_PINS, document.getElementById("epdpins").value);
  await write(EpdCmd.INIT, document.getElementById("epddriver").value);
}

async function syncTime(mode) {
  const timestamp = new Date().getTime() / 1000;
  const data = new Uint8Array([
    (timestamp >> 24) & 0xFF,
    (timestamp >> 16) & 0xFF,
    (timestamp >> 8) & 0xFF,
    timestamp & 0xFF,
    -(new Date().getTimezoneOffset() / 60),
    mode
  ]);
  if (await write(EpdCmd.SET_TIME, data)) {
    addLog("时间已同步！");
    addLog("屏幕刷新完成前请不要操作。");
  }
}

async function clearScreen() {
  if (confirm('确认清除屏幕内容?')) {
    await write(EpdCmd.CLEAR);
    addLog("清屏指令已发送！");
    addLog("屏幕刷新完成前请不要操作。");
  }
}

function resetFileSelector() {
  document.getElementById("binfile").value = '';
  firmwareArray = "";
}
function calculateCRC(localData) {
  var checkPosistion = 0;
  var outCRC = 0;
  addLog(Number("0x" + localData.substring(checkPosistion, checkPosistion + 2)));
  while (checkPosistion < localData.length) {
    outCRC += Number("0x" + localData.substring(checkPosistion, checkPosistion + 2));
    checkPosistion += 2;
  }
  return decimalToHex(outCRC & 0xffff, 4);
}

async function doFinalFlash(crc) {
  addLog("Sending Final flash: " + "C001CEED" + crc);
  await write(EpdCmd.EPD_CMD_OTA_FINSH, "C001CEED" + crc, true);
}

async function sendFile() {
  if (firmwareArray.length == 0) {
    alert("!!!注意!!!\n未选择升级文件");
    return;
  }
  document.getElementById("otabutton").disabled = true;
  let data = firmwareArray;
  startTime = new Date().getTime();
  var part_len = 0x200;
  var addressOffset = 0;
  var inCRC = calculateCRC(data);
  addLog("File CRC = " + inCRC);
  fwSizeComplete = data.length;
  fwBytesTransmited = 0;
  await eraseFwArea();
  while (data.length) {
    var cur_part_len = part_len;
    if (data.length < part_len)
      cur_part_len = data.length;
    var data_part = data.substring(0, cur_part_len);
    data = data.substring(cur_part_len);
    await sendPart(addressOffset, data_part);
    addressOffset += cur_part_len / 2;
  }
  await doFinalFlash(inCRC);
  document.getElementById("otabutton").disabled = false;
}


async function sendcmd() {
  const cmdTXT = document.getElementById('cmdTXT').value;
  if (cmdTXT == '') return;
  const bytes = hex2bytes(cmdTXT);
  await write(bytes[0], bytes.length > 1 ? bytes.slice(1) : null);
}

async function sendimg() {
  const canvasSize = document.getElementById('canvasSize').value;
  const ditherMode = document.getElementById('ditherMode').value;
  const epdDriverSelect = document.getElementById('epddriver');
  const selectedOption = epdDriverSelect.options[epdDriverSelect.selectedIndex];


  startTime = new Date().getTime();
  const status = document.getElementById("status");
  status.parentElement.style.display = "block";

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const processedData = processImageData(imageData);
  await write(EpdCmd.INIT);
  updateButtonStatus(true);

  if (ditherMode === 'fourColor') {
    await writeImage(processedData, 'color');
  } else if (ditherMode === 'threeColor') {
    const halfLength = Math.floor(processedData.length / 2);
    await writeImage(processedData.slice(0, halfLength), 'bw');
    await writeImage(processedData.slice(halfLength), 'red');
  } else if (ditherMode === 'blackWhiteColor') {
    await writeImage(processedData, 'bw');
  } else {
    addLog("当前固件不支持此颜色模式。");
    updateButtonStatus();
    return;
  }

  await write(EpdCmd.REFRESH);
  updateButtonStatus();

  const sendTime = (new Date().getTime() - startTime) / 1000.0;
  addLog(`发送完成！耗时: ${sendTime}s`);
  setStatus(`发送完成！耗时: ${sendTime}s`);
  addLog("屏幕刷新完成前请不要操作。");
  setTimeout(() => {
    status.parentElement.style.display = "none";
  }, 5000);
}

function downloadDataArray() {
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const processedData = processImageData(imageData);
  const mode = document.getElementById('ditherMode').value;

  if (mode === 'sixColor' && processedData.length !== canvas.width * canvas.height) {
    console.log(`错误：预期${canvas.width * canvas.height}字节，但得到${processedData.length}字节`);
    addLog('数组大小不匹配。请检查图像尺寸和模式。');
    return;
  }

  const dataLines = [];
  for (let i = 0; i < processedData.length; i++) {
    const hexValue = (processedData[i] & 0xff).toString(16).padStart(2, '0');
    dataLines.push(`0x${hexValue}`);
  }

  const formattedData = [];
  for (let i = 0; i < dataLines.length; i += 16) {
    formattedData.push(dataLines.slice(i, i + 16).join(', '));
  }

  const colorModeValue = mode === 'sixColor' ? 0 : mode === 'fourColor' ? 1 : mode === 'blackWhiteColor' ? 2 : 3;
  const arrayContent = [
    'const uint8_t imageData[] PROGMEM = {',
    formattedData.join(',\n'),
    '};',
    `const uint16_t imageWidth = ${canvas.width};`,
    `const uint16_t imageHeight = ${canvas.height};`,
    `const uint8_t colorMode = ${colorModeValue};`
  ].join('\n');

  const blob = new Blob([arrayContent], { type: 'text/plain' });
  const link = document.createElement('a');
  link.download = 'imagedata.h';
  link.href = URL.createObjectURL(blob);
  link.click();
  URL.revokeObjectURL(link.href);
}

function updateButtonStatus(forceDisabled = false) {
  const connected = gattServer != null && gattServer.connected;
  const status = forceDisabled ? 'disabled' : (connected ? null : 'disabled');
  document.getElementById("reconnectbutton").disabled = (gattServer == null || gattServer.connected) ? 'disabled' : null;
  document.getElementById("sendcmdbutton").disabled = status;
  document.getElementById("calendarmodebutton").disabled = status;
  document.getElementById("clockmodebutton").disabled = status;
  document.getElementById("clearscreenbutton").disabled = status;
  document.getElementById("sendimgbutton").disabled = status;
  document.getElementById("setDriverbutton").disabled = status;
}

function disconnect() {
  updateButtonStatus();
  resetVariables();
  addLog('已断开连接.');
  document.getElementById("connectbutton").innerHTML = '连接';
}

async function preConnect() {
  if (gattServer != null && gattServer.connected) {
    if (bleDevice != null && bleDevice.gatt.connected) {
      bleDevice.gatt.disconnect();
    }
  }
  else {
    resetVariables();
    try {
      bleDevice = await navigator.bluetooth.requestDevice({
        optionalServices: ['62750001-d828-918d-fb46-b6c11c675aec'],
        acceptAllDevices: true
      });
    } catch (e) {
      console.error(e);
      if (e.message) addLog("requestDevice: " + e.message);
      addLog("请检查蓝牙是否已开启，且使用的浏览器支持蓝牙！建议使用以下浏览器：");
      addLog("• 电脑: Chrome/Edge");
      addLog("• Android: Chrome/Edge");
      addLog("• iOS: Bluefy 浏览器");
      return;
    }

    await bleDevice.addEventListener('gattserverdisconnected', disconnect);
    setTimeout(async function () { await connect(); }, 300);
  }
}

async function reConnect() {
  if (bleDevice != null )
    bleDevice.gatt.disconnect();
  resetVariables();
  addLog("正在重连");
  setTimeout(async function () { await connect(); }, 300);
}

function handleNotify(value, idx) {
  const data = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  // if (idx == 0) {
  if (data[0] == 0xA1) isErase = 1;
  if (data[0] == 0x00) {
    if (data.length > 8) {
      let cmd = data.slice(1)
      addLog(`收到配置：${bytes2hex(cmd)}`);
      const epdpins = document.getElementById("epdpins");
      const epddriver = document.getElementById("epddriver");
      epdpins.value = bytes2hex(cmd.slice(0, 7));
      if (cmd.length > 10) epdpins.value += bytes2hex(cmd.slice(10, 11));
      epddriver.value = bytes2hex(cmd.slice(7, 8));
      updateDitcherOptions();
    }
    if(data.length==5){
      const decoder = new TextDecoder('utf-8'); // 指定字符集为 UTF-8
      const string = decoder.decode(data.slice(1));
      addLog(`模式：${string}`);
    }
  }
  if (textDecoder == null) textDecoder = new TextDecoder();
  addLog(bytes2hex(data), '⇓');
  // } else {
  //   if (data[0] == 0xA1) isErase = 1;
  //   if (textDecoder == null) textDecoder = new TextDecoder();
  //   addLog(textDecoder.decode(data), '⇓');
  // }
}

async function connect() {
  if (bleDevice == null || epdCharacteristic != null) return;

  try {
    addLog("正在连接: " + bleDevice.name);
    gattServer = await bleDevice.gatt.connect();
    addLog('  找到 GATT Server');
    epdService = await gattServer.getPrimaryService('62750001-d828-918d-fb46-b6c11c675aec');
    addLog('  找到 EPD Service');
    epdCharacteristic = await epdService.getCharacteristic('62750002-d828-918d-fb46-b6c11c675aec');
    addLog('  找到 Characteristic');
  } catch (e) {
    console.error(e);
    if (e.message) addLog("connect: " + e.message);
    // disconnect();
    if (bleDevice != null && bleDevice.gatt.connected)
    bleDevice.gatt.disconnect();
    return;
  }

  try {
    const versionCharacteristic = await epdService.getCharacteristic('62750003-d828-918d-fb46-b6c11c675aec');
    const versionData = await versionCharacteristic.readValue();
    appVersion = versionData.getUint8(0);
    addLog(`固件版本: 0x${appVersion.toString(16)}`);
  } catch (e) {
    console.error(e);
    appVersion = 0x15;
  }

  // if (appVersion < 0x16) {
  //   const oldURL = "https://tsl0922.github.io/EPD-nRF5/v1.5";
  //   alert("!!!注意!!!\n当前固件版本过低，可能无法正常使用部分功能，建议升级到最新版本。");
  //   if (confirm('是否访问旧版本上位机？')) location.href = oldURL;
  //   setTimeout(() => {
  //     addLog(`如遇到问题，可访问旧版本上位机: ${oldURL}`);
  //   }, 500);
  // }

  try {
    await epdCharacteristic.startNotifications();
    epdCharacteristic.addEventListener('characteristicvaluechanged', (event) => {
      handleNotify(event.target.value, msgIndex++);
    });
  } catch (e) {
    console.error(e);
    if (e.message) addLog("startNotifications: " + e.message);
  }

  await write(EpdCmd.INIT);

  document.getElementById("connectbutton").innerHTML = '断开';
  updateButtonStatus();
}

function setStatus(statusText) {
  document.getElementById("status").innerHTML = statusText;
}

function setOTAStatus(statusText) {
  document.getElementById("ota_status").innerHTML = statusText;
}

function addLog(logTXT, action = '') {
  const log = document.getElementById("log");
  const now = new Date();
  const time = String(now.getHours()).padStart(2, '0') + ":" +
    String(now.getMinutes()).padStart(2, '0') + ":" +
    String(now.getSeconds()).padStart(2, '0') + " ";

  const logEntry = document.createElement('div');
  const timeSpan = document.createElement('span');
  timeSpan.className = 'time';
  timeSpan.textContent = time;
  logEntry.appendChild(timeSpan);

  if (action !== '') {
    const actionSpan = document.createElement('span');
    actionSpan.className = 'action';
    actionSpan.innerHTML = action;
    logEntry.appendChild(actionSpan);
  }
  logEntry.appendChild(document.createTextNode(logTXT));

  log.appendChild(logEntry);
  log.scrollTop = log.scrollHeight;

  while (log.childNodes.length > 20) {
    log.removeChild(log.firstChild);
  }
}

function clearLog() {
  document.getElementById("log").innerHTML = '';
}

function updateCanvasSize() {
  const selectedSizeName = document.getElementById('canvasSize').value;
  const selectedSize = canvasSizes.find(size => size.name === selectedSizeName);

  canvas.width = selectedSize.width;
  canvas.height = selectedSize.height;

  updateImage(false);
}

function updateDitcherOptions() {
  const epdDriverSelect = document.getElementById('epddriver');
  const selectedOption = epdDriverSelect.options[epdDriverSelect.selectedIndex];
  const colorMode = selectedOption.getAttribute('data-color');
  const canvasSize = selectedOption.getAttribute('data-size');

  if (colorMode) document.getElementById('ditherMode').value = colorMode;
  if (canvasSize) document.getElementById('canvasSize').value = canvasSize;

  updateCanvasSize(); // always update image
}

function updateImage(clear = false) {
  const image_file = document.getElementById('image_file');
  if (image_file.files.length == 0) return;

  if (clear) clearCanvas();

  const file = image_file.files[0];
  let image = new Image();;
  image.src = URL.createObjectURL(file);
  image.onload = function (event) {
    URL.revokeObjectURL(this.src);
    ctx.drawImage(image, 0, 0, image.width, image.height, 0, 0, canvas.width, canvas.height);

    // Redraw text and lines
    redrawTextElements();
    redrawLineSegments();

    convertDithering()
  }
}

function clearCanvas() {
  if (confirm('清除画布已有内容?')) {
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    textElements = []; // Clear stored text positions
    lineSegments = []; // Clear stored line segments
    return true;
  }
  return false;
}

function convertDithering() {
  const contrast = parseFloat(document.getElementById('contrast').value);
  const currentImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const imageData = new ImageData(
    new Uint8ClampedArray(currentImageData.data),
    currentImageData.width,
    currentImageData.height
  );

  adjustContrast(imageData, contrast);

  const mode = document.getElementById('ditherMode').value;
  const processedData = processImageData(ditherImage(imageData));
  const finalImageData = decodeProcessedData(processedData, canvas.width, canvas.height, mode);
  ctx.putImageData(finalImageData, 0, 0);
}

function checkDebugMode() {
  const link = document.getElementById('debug-toggle');
  const urlParams = new URLSearchParams(window.location.search);
  const debugMode = urlParams.get('debug');

  if (debugMode === 'true') {
    document.body.classList.add('debug-mode');
    link.innerHTML = '正常模式';
    link.setAttribute('href', window.location.pathname);
    addLog("注意：开发模式功能已开启！不懂请不要随意修改，否则后果自负！");
  } else {
    document.body.classList.remove('debug-mode');
    link.innerHTML = '开发模式';
    link.setAttribute('href', window.location.pathname + '?debug=true');
  }
}

document.body.onload = () => {
  textDecoder = null;
  canvas = document.getElementById('canvas');
  ctx = canvas.getContext("2d");

  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  initPaintTools();
  updateButtonStatus();
  checkDebugMode();
}

document.getElementById('binfile').addEventListener('change', function (event) {
  const file = event.target.files[0];
  if (file) {
    const reader = new FileReader();

    reader.onload = function (e) {

      firmwareArray = bytes2hex(e.target.result);

      setOTAStatus("File was selected, size: " + firmwareArray.length / 2 + " bytes");
    };

    reader.onerror = function (error) {
      console.error('文件读取发生错误:', error);
    };

    reader.readAsArrayBuffer(file); // 读取文件内容为ArrayBuffer
  } else {
    console.log('未选择文件');
  }
});