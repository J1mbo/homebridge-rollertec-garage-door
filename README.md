[![Donate](https://badgen.net/badge/donate/paypal)](https://paypal.me/HomebridgeJ1mbo)

# homebridge-rollertec-garage-door

A HomeBridge interface for PDT Rollertec controlled garage doors, capable of monitoring and controlling the door. Requires Lo-tech PDT Rollertec interface kit, or equivalent electrical connection. See www.lo-tech.co.uk/wiki/rollertc.

This plugin enables the use of "Hey Siri, Open my Garage Door" and similar voice commands.

Key features:

- Monitors the current door state via the Rollertec status LED, repoing open, closed, opening, closing, or jammed status through HomeKit.
- Can open and close the door.
- Includes reporting of temperature from attached DS18B20 sensor, if fitted to the Lo-tech interface.

When used with the Lo-tech interface, the PDT Rollertec controller can continue to be operated as normal with both push-buttons and RF remote controls if required.

Credits: Based on reference HomeBridge GarageDoorCommand plugin: https://developers.homebridge.io/#/service/GarageDoorOpener

Subscribable events:

- Door state

# TERMS OF USE

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.

THE INTENDED USE OF THE SOFTWARE IS TO ENABLE THE END-USER TO BUILD THEIR OWN AUTOMATION SYSTEM AROUND THE PDT ROLLERTEC DOOR INTERFACE. THE SOFTWARE HAS NOT BEEN TESTED IN ALL POSSIBLE SCENARIOS AND IS NOT A FINISHED PRODUCT IN ITSELF. THE END USER IS RESPONSIBLE FOR TESTING THE COMPLETE SYSTEM AND ALL LIABILITY ARISING FROM ITS USE. BY USING THIS SOFTWARE, YOU ARE ACCEPTING THESE TERMS OF USE.

Copyright (c) 2020,2021 James Pearce.

# IMPORTANT INFORMATION

- MOVING DOORS CAN CAUSE SERIOUS INJURY. NEVER OPERATE THE DOOR UNLESS YOU CAN SEE IT.
- Not all doors are fitted with edge impact detectors, and even where fitted these should not be relied upon.
- Not all LED flash codes are correctly interpretted. This might lead to false alerts, for example if the door controller is receiving radio interference.
- There is no security code in this plugin and the control of access to operate the door is entirely dependent on Apple HomeKit.
- USE OF THIS SOFTWARE IS ENTIRELY AT YOUR OWN RISK.

# Plugin Configuration

Installed through HomeBridge plugins UI, the settings are fully configurable in the UI (see screenshot above).

# Issues and Contact

Please raise an issue should you come across one.
