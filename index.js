// HomeBridge Plugin for PDT RollerTec doors interfaced with Lo-tech PDT RollerTec Controller
// Copyright 2020,2021 James Pearce.
// Based on reference HomeBridge GarageDoorCommand plugin:
// https://developers.homebridge.io/#/service/GarageDoorOpener


// globals and imports
const path = require('path');                     // tells us where this plugin is installed
const child_process = require('child_process');   // used for background interrupt driven monitoring script
var exec = require('child_process').exec;         // used to run scripts
var execSync = require('child_process').execSync; // used to run scripts


// HomeKit API registration
module.exports = (api) => {
  api.registerAccessory('RollertecGarageDoor', RollertecGarageDoorOpenerAccessory);
};


class RollertecGarageDoorOpenerAccessory {

  constructor(log, config, api) {
      this.log = log;
      this.config = config;
      this.api = api;

      this.Service = this.api.hap.Service;
      this.Characteristic = this.api.hap.Characteristic;

      // extract config settings
      this.name = config.name;
      this.sensorName         =                              'Control Box';
      this.doorSerialNumber   = config.doorSerialNumber   || '(not set)';
      this.doorMonitor        = config.doorMonitor        || 'garagedoormonitor.py';
      this.openCommand        = config.open               || 'opendoor.sh';
      this.closeCommand       = config.close              || 'closedoor.sh';
      this.stateCommand       = config.state              || 'status.sh';
      this.ignoreErrors       = config.ignore_errors      || false;
      this.sensorPath         = config.path               || '/sys/bus/w1/devices/w1_bus_master1';
      this.sensorSerialNumber = config.sensorSerialNumber || '';
      this.sensorData         =                              '';

      // create an information service...
      this.informationService = new this.Service.AccessoryInformation()
        .setCharacteristic(this.Characteristic.Manufacturer, "Lo-tech")
        .setCharacteristic(this.Characteristic.Model, "PDT Rollertech")
        .setCharacteristic(this.Characteristic.SerialNumber, this.doorSerialNumber);

      // create a new Garage Door Opener service
      this.doorService = new this.Service.GarageDoorOpener(this.name);

      // create handlers for required characteristics
      this.doorService.getCharacteristic(this.Characteristic.CurrentDoorState)
        .on('get', this.handleCurrentDoorStateGet.bind(this));

      this.doorService.getCharacteristic(this.Characteristic.TargetDoorState)
        .on('get', this.handleTargetDoorStateGet.bind(this))
        .on('set', this.handleTargetDoorStateSet.bind(this));

      this.doorService.getCharacteristic(this.Characteristic.ObstructionDetected)
        .on('get', this.handleObstructionDetectedGet.bind(this));

      // create the temperature sensor service
      this.temperatureService = new this.Service.TemperatureSensor(this.sensorName);

      // create handlers for required characteristics
      this.temperatureService.getCharacteristic(this.Characteristic.CurrentTemperature)
        .on('get', this.getTemperature.bind(this));

      // Define variables
      this.currentState = 1;
      this.targetState  = 1; // assume the door is closed at start up
      this.obstruction  = 0; // assume no obstruction
      this.terminating  = 0; // surpresses helper termination false alert on graceful shutdown
  }


  /**
   * Mandatory getServices function tells HomeBridge how to use this object
   * This also initialises everything.
   */
  getServices() {
    var accessory = this;
    var command;
    // initialise the module ahead of any calls, otherwise an incorrect value is reported
    // in HomeKit when the app is open after restarting HomeBridge or the app.

    // first, we need to locate the temperature sensor (if fitted)
    accessory.log.debug('getServices(): Determining DS18B20 sensor...');
    accessory.sensorData = '';
    accessory.sensorSerialNumber = accessory.sensorSerialNumber.trim();
    if (accessory.sensorSerialNumber === "") {
      command = 'head ' + accessory.sensorPath + '/w1_master_slaves';
      accessory.log.debug('getServices(): Executing command: ' + command);
      var res = require('child_process').execSync(command).toString().trim();
      accessory.log.debug('getServices(): Attempt to find DS18B20 returned: ' + res);
      if (res) {
        accessory.sensorSerialNumber = res;
        accessory.sensorData = accessory.sensorPath + '/' + accessory.sensorSerialNumber + '/w1_slave';
        accessory.log.debug('getServices(): DS18B20 sensor will be queried through: '  + accessory.sensorData);
      } else {
        accessory.log.debug('getServices(): DS18B20 sensor not found.');
      }
    } else {
      accessory.log.debug('getServices(): DS18B20 sensor is manually configured as: #' + this.sensorSerialNumber + '#');
      accessory.sensorData = accessory.sensorPath + '/' + accessory.sensorSerialNumber + '/w1_slave';
      accessory.log.debug('getServices(): DS18B20 sensor will be queried through: '  + accessory.sensorData);
    }

    // Start the phython helper, which will watch the door status and work out what is happening
    const helperPath = path.join(__dirname, this.doorMonitor); // python monitor script
    accessory.log('getServices(): Invoking helper ' + helperPath + ' (' + this.doorMonitor + ')');
    const args = ['-u', helperPath, this.doorMonitor];
    this.terminating  = 0; // starting up
    this.helper = child_process.spawn('python', args);

    this.helper.stderr.on('data', (err) => {
      throw new Error(`getServices(): Helper terminated unexpectedly with error state`);
    });

    this.helper.stdout.on('data', (data) => {
      // command line output received from the watcher so update the status.
      // since the watcher is itself interrupt driven, there is nothing else to do
      accessory.log.debug('getServices(): Received data from helper.');
      accessory.updateDoorState(data);
    });

    this.helper.on('exit', (code) => {
      if (this.terminating == 0) {
        // flag not set - helper crashed
        accessory.log('getServices(): Helper was terminated unexpectedly');
        this.getServices();
      }
    });

    // garbage collector on exit - terminate helper
    this.api.on('shutdown', () => {
      accessory.log('getServices(): Terminating helper');
      this.terminating = 1; // surpresses helper termination false alert on graceful shutdown
      this.helper.kill('SIGHUP');
    });

    // And return the services to HomeBridge
    if (this.sensorSerialNumber) {
      return [
        this.informationService,
        this.doorService,
        this.temperatureService,
      ];
    } else {
      return [
        this.informationService,
        this.doorService,
      ];
    }
  } // getServices()/


  /**
   * updateDoorState is called when the helper determines there has been a change of reported status
   * based on the observed LED flash codes.
   */
  updateDoorState(data) {
    var currentValue;
    var accessory = this;
    var Characteristic = this.Characteristic;

    accessory.log.debug('updateDoorState entered');
    var state = data.toString().trim().split('\n')[0];
    if (state) {
      accessory.log.debug('updateDoorState(): Door Status Read: ' + state);
      if (state === 'STOPPED' && accessory.ignoreErrors) {
        state = 'CLOSED'; // supress reported error is so configured
      }
      accessory.log.debug('State of ' + accessory.name + ' is: ' + state);
      accessory.obstruction = 0; // assume clear unless we find otherwise
      switch(state) {
        case 'OPEN':
          currentValue = 0;
          accessory.targetState = 0; // open, so target is OPEN
          break;
        case 'CLOSED':
          currentValue = 1;
          accessory.targetState = 1; // closed, so target is CLOSED
          break;
        case 'OPENING':
          currentValue = 2;
          accessory.targetState = 0; // opening, so target is OPEN
          break;
        case 'CLOSING':
          currentValue = 3;
          accessory.targetState = 1; // closing, so target is CLOSED
          break;
        case 'STOPPED':
        default:
          currentValue = 4; // Stopped
          accessory.obstruction = 1; // presume jammed
      } // switch
      accessory.log.debug('Current Value: '+ currentValue + '  Obstruction: ' + accessory.obstruction);
      accessory.doorService.updateCharacteristic(Characteristic.TargetDoorState, accessory.targetState);
      accessory.doorService.updateCharacteristic(Characteristic.ObstructionDetected, accessory.obstruction);
      accessory.doorService.updateCharacteristic(Characteristic.CurrentDoorState, currentValue);
      accessory.currentState = currentValue;
    } else {
      accessory.log('updateDoorState(): Warning: No door state received from helper.');
    } // if/else
  } // handleCurrentDoorStateGet(callback)


  /**
   * Handle requests to get the current value of the "Current Door State" characteristic
   */
  handleCurrentDoorStateGet(callback) {
    this.log.debug('Triggered handleCurrentDoorStateGet()');
    callback(null, this.currentState);
  }

  /**
   * Handle requests to get the current value of the "Target Door State" characteristic
   */
  handleTargetDoorStateGet(callback) {
    this.log.debug('Triggered GET TargetDoorState');
    callback(null, this.targetState);
  }

  /**
   * Handle requests to set the "Target Door State" characteristic
   * This is how HomeKit calls for the door to move.
   */
  handleTargetDoorStateSet(value, callback) {
    var command;
    var accessory = this;
    var newstate;

    accessory.targetState = value; // record the target state (0/1 for OPEN/CLOSED)
    switch(value) {
      case 0:
        command = path.join(__dirname, accessory.openCommand) + ' ' + accessory.statusFile;
        newstate = 'OPENING';
        break;
      case 1:
        command = path.join(__dirname, accessory.closeCommand) + ' ' + accessory.statusFile;
        newstate = 'CLOSING';
    } // switch

    accessory.log('GarageCommand: Triggered SET TargetDoorState:' + newstate);
    accessory.log.debug('handleTargetDoorStateSet(): Executing command:' + command);
    exec(command, function (err, stdout, stderr) {
      if (err) {
        accessory.log('Error: ' + err);
        callback(err || new Error('Error setting state of ' + accessory.name));
      } else {
        // command was successfully executed
        var state = stdout.toString('utf-8').trim();
        accessory.log.debug('Set ' + accessory.name + ' to ' + state);
      } // else
    }); // exec

    callback(null);
  } // handleTargetDoorStateSet()


  /**
   * Handle requests to get the current value of the "Obstruction Detected" characteristic
   */
  handleObstructionDetectedGet(callback) {
    this.log.debug('Triggered GET ObstructionDetected');
    callback(null, this.obstruction);
  }

  /**
   * Handle requests to get the current value of the DS18B20 temperature sensor, if it's available.
   */
  getTemperature(callback) {
    var accessory = this;
    var Characteristic = this.Characteristic;

    accessory.log.debug('Triggered GET getTemperature');

    if (accessory.sensorData) {
      var command = 'cat ' + accessory.sensorData;
      accessory.log.debug('getTemperature(): Running ' + command);
      exec(command, function (err, stdout, stderr) {
        if (err) {
          accessory.log('Error: ' + err + ' ' + stderr);
          if (callback) callback(err || new Error('Error getting state (getTemperature) of ' + accessory.name));
        } else {
            // got data from the file OK
            var array = stdout.toString().split("\n");
            if (!array[0].endsWith("YES")) {
              accessory.log('getTemperature: Temp not read - YES not found in CRC string (' + !array[0] + ')');
              if (callback) callback(err || new Error('CRC Error getting state (getTemperature) of ' + accessory.name));
          } else {
            var ts = array[1].split("t=")[1];
            var t = (0.0+parseInt(ts))/1000;
            accessory.log.debug("getTemperature(): Temp in file= " + ts + " calculated to: " + t);
            accessory.temperatureService.updateCharacteristic(Characteristic.CurrentTemperature, t);
            if (callback) { callback(null, t); }
          }
        } // if (err) / else
      }); // exec
    } else {
      accessory.log.debug('getTemperature(): No DS18B20 sensor is configured or detected.');
      accessory.temperatureService.updateCharacteristic(Characteristic.CurrentTemperature, 0);
      if (callback) { callback(null, 0); }
    }
  } // getTemperature

} // class RollertecGarageDoorOpenerAccessory{}

