# [0.2.0]

*** HomeBridge Plugin for Rollertec Garage Door Controllers ***

This plugin enables HomeKit to control a garage door based on the popular PDT Rollertec controller, when interfaced to a Raspberry Pi with the Lo-tech PDT Rollertec Interface kit.
Please read the Important Information below, before continuing.

This plugin has three key components:

1. The plugin itself, index.js
2. The background LED status watcher, garagedoormonitor.py, which enables the plugin to report actual door status to HomeKit regardless of who the door is operated
3. Open and Close scripts - opendoor.sh and closedoor.sh

The plugin can be adapted to other door openers or GPIO interfacing methods by modifying or replacing those scripts, as appropriate.

# KNOWN ISSUES

1. Error starting the phython helper is not correctly trapped.

# IMPORTANT INFORMATION

- MOVING DOORS CAN CAUSE SERIOUS INJURY. NEVER OPERATE THE DOOR UNLESS YOU CAN SEE IT.
- Not all doors are fitted with edge impact detectors, and even where fitted these should not be relied upon.
- Not all LED flash codes are correctly interpretted. This might lead to false alerts, for example if the door controller is receiving radio interference.
- There is no security code in this plugin and the control of access to operate the door is entirely dependent on Apple HomeKit.
- USE OF THIS SOFTWARE IS ENTIRELY AT YOUR OWN RISK.

This is a beta release. If you have any feedback or wish to contribute or extend, please log an issue on the GitHub project page.

