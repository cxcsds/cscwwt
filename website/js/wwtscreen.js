//
// Toggle between normal- and full-screen displays, where possible,
// for the WWT/CSC interface.
// 

const wwtscreen = (function () {

    /*
     * Does the browser support full-screen mode?
     * The logic for this is taken directly from
     * https://github.com/WorldWideTelescope/wwt-website/blob/master/WWTMVC5/Scripts/controls/WebControl.js
     *
     * Could hard-code the supported methods, but not worth it for now
     */
    function hasFullScreen() {
	const el = document.body;
	for (var name of ['requestFullScreen',
			  'mozRequestFullScreen',
			  'webkitRequestFullScreen',
			  'msRequestFullScreen']) {
	    if (name in el) { return true; }
	}
	return false;
    }

    function startFullScreen() {
	const el = document.body;
	for (var name of ['requestFullScreen',
			  'mozRequestFullScreen',
			  'webkitRequestFullScreen',
			  'msRequestFullScreen']) {
	    if (name in el) {
		document.querySelector('#togglefullscreen').innerHTML =
		    'Normal screen';
		el[name]();
		return;
	    }
	}
	console.log("UNEXPECTED: failed to call startFullScreen");
    }

    function stopFullScreen() {
	const el = document;
	for (var name of ['cancelFullScreen',
			  'mozCancelFullScreen',
			  'webkitCancelFullScreen',
			  'msExitFullscreen']) {
	    if (name in el) {
		document.querySelector('#togglefullscreen').innerHTML =
		    'Full screen';
		el[name]();
		return; }
        }
	alert("Eek! Unable to cancel full screen.\nTry hitting Escape.");
    }

    var fullscreen = false;
    var entering_fullscreen = false;
    function toggleFullScreen() {
        let fn;
        if (fullscreen) {
	    fn = stopFullScreen;
        } else {
	    fn = startFullScreen;
	    entering_fullscreen = true;
        }

	// Change fullscreen setting before calling the routine
	// since we use it in resize() to indicate the expected
	// mode.
	//
        fullscreen = !fullscreen;
	fn();
    }

    return { hasFullScreen: hasFullScreen,
	     toggleFullScreen: toggleFullScreen,

	     isFullScreen: () => { return fullscreen; },
	     isEnteringFullScreen: () => { return entering_fullscreen; },

	     // TODO: should this also clear entering_fullscreen?
	     clearFullScreen: () => { fullscreen = false; },

	     clearEnteringFullScreen: () => { entering_fullscreen = false; },

           };
    
})();
