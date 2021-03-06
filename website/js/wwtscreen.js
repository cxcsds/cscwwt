'use strict';

/* global alert */

//
// Toggle between normal- and full-screen displays, where possible,
// for the WWT/CSC interface.
//

const wwtscreen = (function () {

  // Pairs of start/stop full screen attribute names.
  //
  const startAttr = ['requestFullScreen',
		     'mozRequestFullScreen',
		     'webkitRequestFullScreen',
		     'msRequestFullScreen'];
  const stopAttr = ['cancelFullScreen',
		    'mozCancelFullScreen',
		    'webkitCancelFullScreen',
		    'msExitFullscreen'];

  /*
   * Does the browser support full-screen mode?
   * The logic for this is taken directly from
   * https://github.com/WorldWideTelescope/wwt-website/blob/master/WWTMVC5/Scripts/controls/WebControl.js
   *
   * Could hard-code the supported methods, but not worth it for now
   */
  function hasFullScreen() {
    const el = document.body;
    for (var attr of startAttr) {
      if (attr in el) { return true; }
    }
    return false;
  }

  function startFullScreen() {
    const el = document.body;
    for (var attr of startAttr) {
      if (attr in el) {
	/***
	document.querySelector('#togglefullscreen').innerHTML =
	  'Normal screen';
	  ***/
	el[attr]();
	return;
      }
    }
    console.log('UNEXPECTED: failed to call startFullScreen');
  }

  function stopFullScreen() {
    const el = document;
    for (var attr of stopAttr) {
      if (attr in el) {
	/***
	document.querySelector('#togglefullscreen').innerHTML =
	  'Full screen';
	  ***/
	el[attr]();
	return; }
    }
    alert('Eek! Unable to cancel full screen.\nTry hitting Escape.');
  }

  /* tracking the status of the full-screen flag is slightly
     complicated, and is it really worth it (it is partly left
     over from earlier versions of the code).
   */
  var fullscreen = false;
  var enteringFullscreen = false;
  function toggleFullScreen(flag) {
    let fn;
    if (flag) {
      fn = startFullScreen;
      enteringFullscreen = true;
    } else {
      fn = stopFullScreen;
    }

    // Change fullscreen setting before calling the routine
    // since we use it in resize() to indicate the expected
    // mode.
    //
    fullscreen = flag;
    fn();
  }

  return { hasFullScreen: hasFullScreen,
	   toggleFullScreen: toggleFullScreen,

	   isFullScreen: () => { return fullscreen; },
	   isEnteringFullScreen: () => { return enteringFullscreen; },

	   // TODO: should this also clear entering_fullscreen?
	   clearFullScreen: () => { fullscreen = false; },

	   clearEnteringFullScreen: () => { enteringFullscreen = false; }

         };

})();
