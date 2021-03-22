#!/usr/bin/env python2.7
# Lo-tech PDT RollerTec interface initialiser and interupt handler.
# Requires Lo-tech Rollertec Interface kit. See www.lo-tech.co.uk/wiki/rollertec

## Written by James Pearce, April 2020
# Copyright (c) 2020,2021 James Pearce

# This script is run by the plugin as a helper. It does not output anything other than the deteremined door
# state, which is updated only when it changes.

# Outputs to a statusfile in /var/run unless another location is passed in at run time, e.g. "garagedoormonitor.py /tmp/statusfile"
#

import RPi.GPIO as GPIO
import time
import sys

# GPIO 27 is OPEN (green LED) - active LOW
# GPIO 22 is CLOSE (red LED) - active LOW
# GPIO 23 drives T13 (close)
# GPIO 24 drives T15 (open) - T14 is common
GPIO_OPEN = 27
GPIO_CLOSE = 22
GPIO_T13 = 23
GPIO_T15 = 24

# LED colour constants
LED_OFF = 0
LED_RED = 1
LED_GREEN = 2
LED_ORANGE = 3

# Note: Status values used within this script are aligned to Apple Homekit
# return values:
#   0 - No input detected
#   1 - OPEN
#   2 - Door Opening
#   3 - CLOSED
#   4 - Door Closing
#   5 - Jammed/Error
STATE_NOINPUT = 0
STATE_OPEN = 1
STATE_OPENING = 2
STATE_CLOSED = 3
STATE_CLOSING = 4
STATE_ERROR = 5
INDETERMINATE = 6

#Status file determination - this is used to list the current door status (closed/open etc)
if (len(sys.argv) == 2):
  STATUSFILE = sys.argv[1]
else:
  STATUSFILE = "/var/run/garagedoorstatus"

# Global variables
spinlock = 0 # used to ensure events are processed in order
updatinglist = 0 # used to ensure single thread accesses list

# This script records each LED status change in a list to work out what's happening.
# Generally all flash codes the door controller reports last <= 2 seconds.

# Format of each record will be [time(), LED_Colour]
eventlist = []


def init_gpio():
  GPIO.setwarnings(False)
  GPIO.cleanup()
  GPIO.setmode(GPIO.BCM)

  # Initialise both input channels and set pull-up (opto's are open-collector)
  GPIO.setup(GPIO_OPEN, GPIO.IN, pull_up_down=GPIO.PUD_UP)
  GPIO.setup(GPIO_CLOSE, GPIO.IN, pull_up_down=GPIO.PUD_UP)

  # Initialise the output channels to low (i.e. relays OFF)
  GPIO.setup(GPIO_T13, GPIO.OUT)
  GPIO.output(GPIO_T13, GPIO.LOW)
  GPIO.setup(GPIO_T15, GPIO.OUT)
  GPIO.output(GPIO_T15, GPIO.LOW)


def ledcolour(open,close):
  # determines the LED colour given the point-in-time values of the two values
  # note - inputs from the Opto's are active LOW
  retval = 0
  if (open == 1) & (close == 1): retval = LED_OFF
  if (open == 1) & (close == 0): retval = LED_RED
  if (open == 0) & (close == 1): retval = LED_GREEN
  if (open == 0) & (close == 0): retval = LED_ORANGE
  return retval


def TrimEvents(mode):
  # trims out records older than 2 seconds
  # if mode = 0, any record
  # if mode = 1, all but the most recent record (steady-state)
  global eventlist
  global updatinglist

  retval = 0
  if (updatinglist != 1):
    updatinglist = 1 # preventing re-enterence
    done = 0
    if eventlist: # check for empty list
      while (len(eventlist) >= 1) & (not done):
        if time.time() - eventlist[0][0] > 2:
          if (len(eventlist) == 1) & (mode == 1): done = 1 # keep the most recent record
          else: del eventlist[0]
        else: done = 1 # nothing to age expire from list.
    updatinglist = 0 # allow access

    # return 0 if list is empty, 1 otherwise
    if eventlist: retval = 1
    return retval


# Define threaded callback function, called when events are detected on input pins (i.e. status change)
def StatusChange(channel):
  # called whenever rising or falling edge detected on GPIO_OPEN
  # note - run in a seperate thread, hence the use of the lock

  global spinlock
  global eventlist

  #print("State Change. Spinlock is currently ", spinlock)
  #print("LED Colour:", ledcolour(GPIO.input(GPIO_OPEN), GPIO.input(GPIO_CLOSE)) )

  if not spinlock:
    spinlock = 1 # grab the lock
    time.sleep(0.005) # add a brief pause to prevent double-banging due to syncronisation lag between LEDs

    # Populate the new times and values, but only if the value has changed from the most recently recorded event
    # (RollerTec updates the LED status every two seconds)
    eventdata = []
    eventdata = [ time.time(), ledcolour(GPIO.input(GPIO_OPEN), GPIO.input(GPIO_CLOSE)) ]
    if eventlist:
      if (eventlist[-1][1] != eventdata[1]): eventlist.append(eventdata)
    else: eventlist.append(eventdata) # first entry in list

    if eventlist: TrimEvents(1) # trim anything older than 2s, except the latest reading

    # release the lock
    spinlock = 0
  # nothing to do if the lock is held as another running instance of this function is already handling it


def DetermineState():
  # This routine looks through the event readings and tries to work out what is going on
  # by analysing eventdata[]. Returns a state value.
  retval = 0
  global eventlist

  retval = INDETERMINATE

  if eventlist: TrimEvents(1) # trim anything older than 2s, but retain most recent reading

  # determine a numeric state according to these state codes:
  if not eventlist:
    # we don't yet have any readings so the state must be disconnected/initialising
    retval = STATE_NOINPUT
  else:
    # We have one or more entries. Can use latest reading if >2 seconds old
    if time.time() - eventlist[-1][0] > 2:
      if eventlist[-1][1] == LED_OFF: retval = STATE_NOINPUT
      if eventlist[-1][1] == LED_GREEN: retval = STATE_OPEN
      if eventlist[-1][1] == LED_RED: retval = STATE_CLOSED
      if eventlist[-1][1] == LED_ORANGE: retval = STATE_ERROR
    else:
      # Check for any ORANGE, which would be an error state
      for event in eventlist:
        if (event[1] == LED_ORANGE): retval = STATE_ERROR
      if (retval != STATE_ERROR):
        # not an error, so must be a flashing status
        # if latest entry is LED_OFF, state is indeterminate.
        if eventlist[-1][1] == LED_OFF: retval = INDETERMINATE
        else:
          # We have a code to work with.
          # Hopefully there are only 2 entries as it's OPENING or CLOSING
          if len(eventlist) == 2:
            if eventlist[0][1] == LED_OFF:
              if eventlist[1][1] == LED_GREEN: retval = STATE_OPENING
              elif eventlist[1][1] == LED_RED: retval = STATE_CLOSING

  return retval # return the state code


def StateValToText(state):
  # converts a state code to HomeBridge return value
  # these will be logged in the status file and reported by status.sh when called by HomeBridge
  retval = ""
  if state == STATE_NOINPUT: retval = "STOPPED"
  if state == STATE_OPEN: retval = "OPEN"
  if state == STATE_OPENING: retval = "OPENING"
  if state == STATE_CLOSED: retval = "CLOSED"
  if state == STATE_CLOSING: retval = "CLOSING"
  if state == STATE_ERROR: retval = "STOPPED"
  return retval


# ** MAIN PROGRAM SECTION **

# Informational headers
#print "Lo-tech PDT RollerTec Interface Monitor"
#print "Copyright (c) 2020,2021, James Pearce. All rights reserved."
#print ""
#print "Initialising interrupt handlers..."

init_gpio()

# Trap any change on either input - falling and rising
# Established with no debounce - digital inputs from LoTech RollerTec LED Interface
GPIO.add_event_detect(GPIO_OPEN, GPIO.BOTH, callback=StatusChange)
GPIO.add_event_detect(GPIO_CLOSE, GPIO.BOTH, callback=StatusChange)

# Now run the handler manually to grab the 'startup' value
time.sleep(0.5)
StatusChange(0) # check LED values
#print "Done. Initialised RaspberryPi for Lo-tech PDT RollerTec interface."

laststate = -1 # initialisation value

try:
  while True:
    time.sleep(0.25) # check what's going on periodically
    # * Debug * - print(eventlist)
    while spinlock:
      time.sleep(0.01) # wait for interupt handler to complete if it's in-progress
    newstate = DetermineState()
    if (newstate != laststate):
      if (newstate != INDETERMINATE):
        # positively determined the status, so report and store it
        #print("Monitoring system (Status is currently " + StateValToText(newstate) + "). CTRL-C to end.")
        # debug - print(eventlist)
        # record to status file
#        outF = open(STATUSFILE, "w")
#        outF.write(StateValToText(newstate))
#        outF.write("\n")
#        outF.close()
        laststate = newstate
        # and output value to console - this is trapped in Homebridge plugin
        print(StateValToText(newstate))
    # since the monitoring handlers are interrupt driven, we only need to update the status here
    # and in the logs periodically. There is nothing else to do.
    # Note: GPIO.wait_for_edge is not used because the LEDs can change state independently and we don't
    # have a combined OR'd input from the interface board. Hence just sleep for a bit.

except KeyboardInterrupt:
  #print("")
  #print("Unregistering interrupt handlers....")
  # unbind the handlers and clean up on CRTL+C exit
  GPIO.remove_event_detect(GPIO_OPEN)
  GPIO.remove_event_detect(GPIO_CLOSE)
  GPIO.cleanup()

# Standard exit:
#print("Finished.")

