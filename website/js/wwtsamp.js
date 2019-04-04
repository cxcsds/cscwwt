//
// Support SAMP use by the CSC2/WWT interface. This is a wrapper around
// routines from samp.js and is tightly integrates with wwt.js.
//

const wwtsamp = (function () {

    // Only try to register with a SAMP hub when we are called.
    //
    var sampName = "CSC 2.0 + WWT";
    var sampMeta = {
	"samp.name": sampName,
	"samp.description": "Explore CSC 2.0 with WWT",
	"author.affiliation": "Chandra X-ray Center",
	// This icon is too large, but better than nothing
	"samp.icon.url": "http://cxc.harvard.edu/csc2/imgs/csc_logo_navbar.gif"
    };
    
    var sampConnection = null;
    var sampClientTracker = null;
    var sampIsRegistered = false;

    var sampUpdate = null;
    var sampTrace = null;

    // The arguments are functions which take a single paremerter and
    // are used
    //   report - to report a message from a SAMP process (e.g.
    //     that a call has been made) that is expected to be visible
    //     to the user. This message is a string, and can include
    //     inline HTML markup.
    //   trace - a message that is logged to the console (perhaps with
    //     extra information for tracking).
    //
    //
    function openSAMP(report, trace) {
	if (sampConnection !== null) { return; }

	sampReport = report;
	sampTrace = trace;

	// Could create this in global scope, but let's see if we can
	// initialize it the first time it is needed.
	//
	if (sampClientTracker === null) {
	    sampClientTracker = new samp.ClientTracker();
	    const handler = sampClientTracker.callHandler;
	    handler["coord.pointAt.sky"] = handlePointAtSky;
	}

	sampConnection = new samp.Connector(sampName,
					    sampMeta,
					    sampClientTracker,
					    sampClientTracker.calculateSubscriptions()
					   );

	sampTrace("Created SAMP connection object");

	// The button needs to be hidden, but in such a way that
	// if the hub is unregistered then it can be re-shown.
	//
	const el = document.querySelector('#register-samp');

	// Try to avoid polling too often (in part because it seems to
	// create a CORS-related error on the console).
	//
	sampConnection.onHubAvailability(sampIsAvailable, 5000);
	sampConnection.onreg = () => {
	    sampIsRegistered = true;

	    el.classList.remove('requires-samp');
	    el.style.display = 'none';

	    sampTrace("Registered with SAMP hub");
	}
	sampConnection.onunreg = () => {
	    sampIsRegistered = false;

	    // Does this make sense? The icon needs to be re-displayed
	    // if the hub is available
	    el.classList.add('requires-samp');

	    sampTrace("Un-registered from SAMP hub");
	}
    }

    function registerSAMP() {
	openSAMP();
	if (sampIsRegistered) { return; }
	sampConnection.register();
    }

    function closeSAMP() {
	if (sampConnection === null) { return; }
	if (sampIsRegistered) {
	    sampConnection.unregister();
	}
	// Do not close SAMP completely (I think because I was concerned
	// about it potentially causing problems with any unregister
	// operation).
	//
	// sampConnection = null;

	sampTrace("Unregistered SAMP");
    }

    // When do we show the register button
    function sampIsAvailable(flag) {

	const style = flag ? 'block' : 'none'; // are any inline-block?
	for (let el of document.querySelectorAll(".requires-samp")) {
	    el.style.display = style;
	}
    }

    // Provide an explicit error handler as the default one appears to
    // cause an error to be reported in the JS console.
    //
    function ignoreSAMPError(event) {
	sampTrace("Ignoring a SAMP error");
    }

    function reportSAMPError(event) {
	// need to integrate this into the UI better
	//
	alert("Unable to send a Web-SAMP message.\n\nIs a SAMP hub running?");
    }

    // hard code a "basic source properties" like query
    // using a cone search
    //
    // rmax is the search radius, in arcmin
    //
    // TODO: it might help if I added in the mark-sweep check on the
    // ra and dec values (e.g. a simple >=/<= check) as this is what
    // CSCView does, but I haven't checked how it handles near the poles.
    //
    function masterSourcePropertiesNear(ra, dec, rmax) {
	return 'http://cda.cfa.harvard.edu/csccli/getProperties?outputFormat=votable&version=cur&query=select%20distinct%20name,%20ra,%20dec,%20err_ellipse_r0,%20err_ellipse_r1,%20err_ellipse_ang,%20significance,%20likelihood,%20likelihood_class,%20conf_flag,%20extent_flag,%20sat_src_flag,%20streak_src_flag,%20var_flag,%20flux_aper_b,%20flux_aper_lolim_b,%20flux_aper_hilim_b,%20flux_aper_w,%20flux_aper_lolim_w,%20flux_aper_hilim_w,%20hard_hm,%20hard_hm_lolim,%20hard_hm_hilim,%20hard_ms,%20hard_ms_lolim,%20hard_ms_hilim,%20var_intra_index_b,%20var_intra_index_w,%20var_inter_index_b,%20var_inter_index_w,%20acis_time,%20hrc_time%20from%20master_source%20where%20dbo.cone_distance%28ra,dec,' +
	    ra.toString() + ',' + dec.toString() +
	    '%29%3C%3D' + rmax.toString() +
	    '%20order%20by%20flux_aper_b%20desc,%20flux_aper_w%20desc';
    }

    // I was going to return a subset of data, but let's see what returning
    // all the master-source table does
    //
    function masterSourcePropertiesByName(name) {
	return 'http://cda.cfa.harvard.edu/csccli/getProperties?outputFormat=votable&version=cur&query=select%20*%20from%20master_source%20where%20name%20%3D%20%27' +
	    encodeURIComponent(name) +
	    '%27';
    }

    // Should we let the user know when there was no response to the
    // message.
    //
    // Should we provide id's or names of the applications?
    //
    function handleSAMPResponse(mtype) {
	return (resp) => {
	    let msg;
	    const n = resp.length;
	    if (n === 0) {
		msg = "No Virtual Observatory application responded to the " +
		    mtype + " request!";
	    } else if (n == 1) {
		msg = "One application responded to " +
		    "the " + mtype + " request.";
	    } else {
		msg = resp.length.toString() + " applications responded to " +
		    "the " + mtype + " request.";
	    }

	    if ((n > 0) && (mtype === "image.load.fits")) {
		msg += "\nWarning: downloading the stack event file can take a long time!";
	    }

	    sampReport(msg);
	};
    }

    // SAMP message to change position.
    //
    function handlePointAtSky(senderId, message, isCall) {
	const params = message["samp.params"];
	const ra = params["ra"];
	const dec = params["dec"];

	console.log("pointAt.sky sent"); console.log(typeof ra); console.log(typeof dec);

        wwt.gotoRaDecZoom(ra, dec, wwt.get_fov(), false);
	sampUpdate("Moving to α=" + ra + " δ=" + dec);
    }

    // Tell others we've moved.
    // *** FOR NOW this does nothing, as it is annoying for people with
    //     a SAMP hub; i.e. moving anyplace leads to a request to
    //     let WWT talk to the SAMP hub.
    //
    function moveTo(ra, dec) {

	return;

/***
	// do we want to register with a SAMP hub if one is running;
	// it is a bit confusing but lets the user know that moving
	// does send a SAMP message. The alternative is to only
	// send this message after we are explicitly registerd in
	// some other manner.
	//
	// if (!sampIsRegistered) { return; }

	openSAMP();
	if (sampConnection === null) { return; }

	sampConnection.runWithConnection((conn) => {
	    const msg = new samp.Message("coord.pointAt.sky",
					 {ra: ra.toString(),
					  dec: dec.toString()});
	    conn.notifyAll([msg], handleSAMPResponse("coord.pointAt.sky"));
	}, ignoreSAMPError);
***/

    }

    // Should we also send an ID?
    //
    function sendURL(mtype, url, desc) {

	openSAMP();

	sampConnection.runWithConnection((conn) => {
	    const msg = new samp.Message(mtype, {url: url, name: desc});
	    conn.notifyAll([msg], handleSAMPResponse(mtype));
	}, reportSAMPError);

    }

    // Send the "currently displayed" source properties via SAMP. This
    // actually sends a cone search that should match the filter used
    // to display the sources.
    //
    // ra, dec, and fov are in decimal degrees, and fov is
    // converted to a search radius.
    //
    function sendSourcePropertiesNear(ra, dec, fov) {

	sampTrace("SAMP: source properties near " + ra + " " + dec + " r= " + fov);
	if ((ra === null) || (dec === null) || (fov === null)) {
	    console.log("Internal error: missing location");
	    return;
	}

	const rmax = fov * 60.0;  // convert to arcmin
	const url = masterSourcePropertiesNear(ra, dec, rmax);
	sendURL("table.load.votable", url,
		"CSC 2.0 basic source properties (cone-search)");
    }

    function sendSourcePropertiesName(name) {

	sampTrace("SAMP: source properties name " + name);

	const url = masterSourcePropertiesByName(name);
	sendURL("table.load.votable", url,
		"CSC 2.0 master-source properties (single source)");
    }

    function sendStackEvt3(stack, stackver) {

	sampTrace("SAMP: stack=" + stack + " ver=" + stackver.toString());

	// simple for now
	let verstr;
	if (stackver < 10)       { verstr = "00" + stackver.toString(); }
	else if (stackver < 100) { verstr = "0" + stackver.toString(); }
	else                     { verstr = stackver.toString(); }

	const url = 'http://cda.harvard.edu/csccli/retrieveFile?' +
	    'version=cur&filetype=stkevt3&filename=' + stack + 'N' +
	    verstr + '_evt3.fits';

	console.log("--> sending image.load.fits for " + url);
	sendURL("image.load.fits", url,
		"Stack evt3 for " + stack);
    }

    
    return { setup: openSAMP,
	     teardown: closeSAMP,

	     moveTo: moveTo,

	     register: registerSAMP,

	     sendSourcePropertiesNear: sendSourcePropertiesNear,
	     sendSourcePropertiesName: sendSourcePropertiesName,
	     sendStackEvt3: sendStackEvt3,

	     // For debugging
	     getSAMPConnection: () => { return sampConnection; },
	   };

})();
