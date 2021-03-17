#!/bin/bash
# Copyright (c) 2020,2021 James Peace
# sends command to open the garage door.
# Requires Lo-tech Rollertec Interface connected to PDT Rollertec door controller.

# Determine location of status file
args=("$@")
if [[ $# -eq 1 ]]
then
  STATUSFILE=${args[0]}
else
  STATUSFILE="/run/garagedoorstatus"
fi

# toggle the GPIO to send the command to the RollerTec, same as pressing the down button
logger "RollerTec (INFO) - toggling gpio 24 to request door OPEN action"
gpio -g write 24 1 && sleep 0.5 && gpio -g write 24 0

# update the status in /var/run
echo OPENING > $STATUSFILE

# return value to homebridge
# must be OPEN, CLOSED, OPENING, CLOSING, STOPPED
echo OPENING
exit 0

