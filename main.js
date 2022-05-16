//webcam
const video = document.getElementById('webcam');
const liveView = document.getElementById('liveView');
const demosSection = document.getElementById('demos');
const enableWebcamButton = document.getElementById('webcamButton');
const avaSensitive = document.querySelector("#avaSensitive");
var commands = [];

// Check if webcam access is supported.
function getUserMediaSupported() {
  return !!(navigator.mediaDevices &&
    navigator.mediaDevices.getUserMedia);
}

// If webcam supported, add event listener to button for when user
// wants to activate it to call enableCam function which we will 
// define in the next step.
if (getUserMediaSupported()) {
  enableWebcamButton.addEventListener('click', enableCam);
} else {
  console.warn('getUserMedia() is not supported by your browser');
}

// Enable the live webcam view and start classification.
function enableCam(event) {
  // Only continue if the COCO-SSD has finished loading.
  if (!model) {
    return;
  }
  
  // Hide the button once clicked.
  event.target.classList.add('removed');  
  
  // getUsermedia parameters to force video but not audio.
  const constraints = {
    video: true
  };

  // Activate the webcam stream.
  navigator.mediaDevices.getUserMedia(constraints).then(function(stream) {
    video.srcObject = stream;
    video.addEventListener('loadeddata', predictWebcam);
  });
}

var children = [];

function predictWebcam() {
  // Now let's start classifying a frame in the stream.
  model.detect(video).then(function (predictions) {
    // Remove any highlighting we did previous frame.
    for (let i = 0; i < children.length; i++) {
      liveView.removeChild(children[i]);
    }
    children.splice(0);
    
    // Now lets loop through predictions and draw them to the live view if
    // they have a high confidence score.
    for (let n = 0; n < predictions.length; n++) {
      // If we are over 66% sure we are sure we classified it right, draw it!
      if (predictions[n].score > 0.66) {
        const p = document.createElement('p');
        p.innerText = predictions[n].class  + ' ' 
            + Math.round(parseFloat(predictions[n].score) * 100) 
            + '%';
        p.style = 'margin-left: ' + predictions[n].bbox[0] + 'px; margin-top: '
            + (predictions[n].bbox[1] - 10) + 'px; width: ' 
            + (predictions[n].bbox[2] - 10) + 'px; top: 0; left: 0;';

        const highlighter = document.createElement('div');
        highlighter.setAttribute('class', 'highlighter');
        highlighter.style = 'left: ' + predictions[n].bbox[0] + 'px; top: '
            + predictions[n].bbox[1] + 'px; width: ' 
            + predictions[n].bbox[2] + 'px; height: '
            + predictions[n].bbox[3] + 'px;';

        liveView.appendChild(highlighter);
        liveView.appendChild(p);
        children.push(highlighter);
        children.push(p);
        commands = [];
        //Send commands by object position
        if (gattCharacteristic) {
          commands.push(32);//head
          commands.push(243);//function id auto tracking
          commands.push(parseInt(avaSensitive.value));//sensetive mode: 1-Super Slow,2-Slow,3-Medium,4-Fast,5-Super Fast
          commands.push(0);//rotate direction front/back cameras
          commands.push(8);//middle width = screen width * A / 100

          //Screen width, Screen height, Detected object X axis = A * 100 + B
          //0 <= A, B <= 255

          //Full video screen width
          if (video.width < 100) {
            commands.push(0); //A
            commands.push(video.width); //B
          } else {
            commands.push(Math.floor(video.width / 100)); //A
            commands.push(video.width % 100); // B
          }

          //Full video screen height
          if (video.height < 100) {
            commands.push(0); //A
            commands.push(video.height); //B
          } else {
            commands.push(Math.floor(video.height / 100)); //A
            commands.push(video.height % 100); //B
          }
          //Position of detected object on the full video screen
          var locationPointX = parseInt(predictions[n].bbox[0] + predictions[n].bbox[2]/2); // left + width / 2 
          if (locationPointX < 100) {
            commands.push(0); //A
            commands.push(locationPointX > 0?locationPointX:0); //B
          } else {
            commands.push(Math.floor(locationPointX / 100)); //A
            commands.push(locationPointX % 100); //B
          }
          //Xor summary
          commands.push(getXorCrc(commands));
          //Sending to AVA device 
          console.log(commands);
          gattCharacteristic.writeValueWithoutResponse(new Uint8Array(commands));
        }
      }
    }
    
    // Call this function again to keep predicting when the browser is ready.
    window.requestAnimationFrame(predictWebcam);
  });
}
// Store the resulting model in the global scope of our app.
var model = undefined;

// Before we can use COCO-SSD class we must wait for it to finish
// loading. Machine Learning models can be large and take a moment 
// to get everything needed to run.
// Note: cocoSsd is an external object loaded from our index.html
// script tag import so ignore any warning in Glitch.
cocoSsd.load().then(function (loadedModel) {
  model = loadedModel;
  // Show demo section now model is ready to use.
  demosSection.classList.remove('invisible');
});

//ble

var deviceName = 'AVA N20'
var bleService = '0000ff07-0000-1000-8000-00805f9b34fb'
var bleCharacteristic = '0000ff01-0000-1000-8000-00805f9b34fb'
var bluetoothDeviceDetected;
var gattCharacteristic;

document.querySelector('#connectAvaButton').addEventListener('click', function() {
  if (isWebBluetoothEnabled()) { connectAva() }
})

//Xor calculator
function getXorCrc(items)
{
  let crc = 0;
  for(var i=0; i<=items.length - 1; i++) {
    crc = crc ^ items[i];
  }
  return crc;
}

//Check WebBLE support or not
function isWebBluetoothEnabled() {
  if (!navigator.bluetooth) {
    console.warn('Web Bluetooth API is not available in this browser!');
    return false
  }

  return true
}


//Get ble device info
function getDeviceInfo() {
  let options = {
    optionalServices: [bleService],
    filters: [
      { "name": deviceName }
    ]
  }

  console.log('Requesting any Bluetooth Device...')
  return navigator.bluetooth.requestDevice(options).then(device => {
    bluetoothDeviceDetected = device
  }).catch(error => {
    console.log('Argh! ' + error)
  })
}
//Connect to AVA Device
function connectAva() {
  return (bluetoothDeviceDetected ? Promise.resolve() : getDeviceInfo())
  .then(connectGATT)
  .catch(error => {
    console.log('Waiting to start reading: ' + error)
  })
}

function connectGATT() {
  if (bluetoothDeviceDetected.gatt.connected && gattCharacteristic) {
    return Promise.resolve()
  }

  return bluetoothDeviceDetected.gatt.connect()
  .then(server => {
    console.log('Getting GATT Service...')
    return server.getPrimaryService(bleService)
  })
  .then(service => {
    console.log('Getting GATT Characteristic...')
    return service.getCharacteristic(bleCharacteristic)
  })
  .then(characteristic => {
    gattCharacteristic = characteristic;
    document.querySelector('#connectAvaButton').style.display = 'none';
    avaSensitive.style.display = "block";
  })
}