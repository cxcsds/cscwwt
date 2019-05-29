'use strict';

/* global alert */
/* global samp, wwt */

//
// Support SAMP use by the CSC2/WWT interface. This is a wrapper around
// routines from samp.js and is tightly integrates with wwt.js.
//

const wwtsamp = (function () {

  // Only try to register with a SAMP hub when we are called.
  //
  const sampName = 'CSC 2.0 + WWT';
  const sampMeta = {
    'samp.name': sampName,
    'samp.description': 'Explore CSC 2.0 with WWT',
    'author.affiliation': 'Chandra X-ray Center',
    // This icon is too large, but better than nothing
    'samp.icon.url': 'http://cxc.harvard.edu/csc2/imgs/csc_logo_navbar.gif'
  };

  var sampConnection = null;
  var sampClientTracker = null;
  var sampHubIsPresent = false;
  var sampIsRegistered = false;

  var sampReport = null;
  var sampTrace = null;

  var sampCheckHandler = null;

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
  function onload(report, trace) {
    sampReport = report;
    sampTrace = trace;
  }

  function openSAMP() {
    if (sampConnection !== null) { return; }

    // Could create this in global scope, but let's see if we can
    // initialize it the first time it is needed.
    //
    if (sampClientTracker === null) {
      sampClientTracker = new samp.ClientTracker();
      const handler = sampClientTracker.callHandler;
      handler['coord.pointAt.sky'] = handlePointAtSky;
    }

    sampConnection = new samp.Connector(sampName,
                                        sampMeta,
                                        sampClientTracker,
                                        sampClientTracker.calculateSubscriptions()
                                       );

    sampTrace('Created SAMP connection object');

    // The button needs to be hidden, but in such a way that
    // if the hub is unregistered then it can be re-shown.
    //
    const el = document.querySelector('#register-samp');

    startPolling();
    sampConnection.onreg = () => {
      sampIsRegistered = true;

      el.classList.remove('requires-samp');
      el.style.display = 'none';

      sampTrace('Registered with SAMP hub');
    }
    sampConnection.onunreg = () => {
      sampIsRegistered = false;

      // Does this make sense? The icon needs to be re-displayed
      // if the hub is available
      el.classList.add('requires-samp');

      sampTrace('Un-registered from SAMP hub');
    }
  }

  // Try to avoid polling too often (in part because it seems to
  // create a CORS-related error on the console when no hub is
  // present). Should polling be disabled when connected to a hub,
  // or should it be kept so that we can perhaps-better-handle the
  // case of the hub disappearing without sending out shutdown
  // messages?
  //
  function startPolling() {
    stopPolling();
    if (sampConnection === null) { return; }
    sampCheckHandler = sampConnection.onHubAvailability(sampIsAvailable, 5000);
    sampTrace(`Started SAMP polling: handler ${sampCheckHandler}`);
  }

  // A user may want to stop polling if they know they are not
  // using SAMP. Should this unregister/disconnect the SAMP object
  // too?
  //
  function stopPolling() {
    if (sampCheckHandler === null) { return; }
    sampTrace(`Stopping SAMP polling: handler ${sampCheckHandler}`);
    clearInterval(sampCheckHandler);
    sampCheckHandler = null;
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

    // Ensure any elements that require SAMP are hidden
    for (let el of document.querySelectorAll('.requires-samp')) {
      el.style.display = 'none';
    }

    sampTrace('Unregistered SAMP');
  }

  // When do we show the register button
  function sampIsAvailable(flag) {

    sampHubIsPresent = flag;

    const style = flag ? 'block' : 'none'; // are any inline-block?
    for (let el of document.querySelectorAll('.requires-samp')) {
      el.style.display = style;
    }
  }

  // Provide an explicit error handler as the default one appears to
  // cause an error to be reported in the JS console.
  //
  // Currently unused.
  function ignoreSAMPError(event) {
    sampTrace('Ignoring a SAMP error');
  }

  function reportSAMPError(event) {
    // need to integrate this into the UI better
    //
    alert('Unable to send a Web-SAMP message.\n\nIs a SAMP hub running?');
  }

  // Return the query for a master-source cone search returning the
  // given cols. It is ordered by flux (descending).
  //
  // hard code a 'basic source properties' like query
  // using a cone search
  //
  // rmax is the search radius, in arcmin
  //
  // TODO: it might help if I added in the mark-sweep check on the
  // ra and dec values (e.g. a simple >=/<= check) as this is what
  // CSCView does, but I haven't checked how it handles near the poles.
  //
  function masterQueryNear(ra, dec, rmax, cols) {
    return `http://cda.cfa.harvard.edu/csccli/getProperties?outputFormat=votable&version=cur&query=select%20distinct%20${cols.join(',')}%20from%20master_source%20where%20dbo.cone_distance%28ra,dec,${ra},${dec}%29%3C%3D${rmax}%20order%20by%20flux_aper_b%20desc,%20flux_aper_w%20desc`;
  }

  // Master Source: Basic Summary
  //
  function masterSourceBasicNear(ra, dec, rmax) {
    const cols = ['name', 'ra', 'dec',
		  'err_ellipse_r0', 'err_ellipse_r1', 'err_ellipse_ang',
		  'significance', 'likelihood_class',
		  'conf_flag', 'sat_src_flag',
		  'streak_src_flag',
		  'flux_aper_b', 'flux_aper_lolim_b', 'flux_aper_hilim_b',
		  'flux_aper_w', 'flux_aper_lolim_w', 'flux_aper_hilim_w'];
    return masterQueryNear(ra, dec, rmax, cols);
  }

  // Master Source: Summary
  //
  function masterSourcePropertiesNear(ra, dec, rmax) {
    const cols = ['name', 'ra', 'dec',
		  'err_ellipse_r0', 'err_ellipse_r1', 'err_ellipse_ang',
		  'significance', 'likelihood', 'likelihood_class',
		  'conf_flag', 'extent_flag', 'sat_src_flag',
		  'streak_src_flag', 'var_flag',
		  'flux_aper_b', 'flux_aper_lolim_b', 'flux_aper_hilim_b',
		  'flux_aper_w', 'flux_aper_lolim_w', 'flux_aper_hilim_w',
		  'hard_hm', 'hard_hm_lolim', 'hard_hm_hilim',
		  'hard_ms', 'hard_ms_lolim', 'hard_ms_hilim',
		  'var_intra_index_b', 'var_intra_index_w',
		  'var_inter_index_b', 'var_inter_index_w',
		  'acis_time', 'hrc_time'];
    return masterQueryNear(ra, dec, rmax, cols);
  }

  // Master Source: Photometry
  //
  function masterSourcePhotometryNear(ra, dec, rmax) {
    const cols = ['name', 'ra', 'dec',
		  'err_ellipse_r0', 'err_ellipse_r1', 'err_ellipse_ang',
		  'significance', 'likelihood', 'likelihood_class',
		  'conf_flag', 'sat_src_flag', 'streak_src_flag',
		  'flux_aper_b', 'flux_aper_lolim_b', 'flux_aper_hilim_b',
		  'flux_aper_h', 'flux_aper_lolim_h', 'flux_aper_hilim_h',
		  'flux_aper_m', 'flux_aper_lolim_m', 'flux_aper_hilim_m',
		  'flux_aper_s', 'flux_aper_lolim_s', 'flux_aper_hilim_s',
		  'flux_aper_u', 'flux_aper_lolim_u', 'flux_aper_hilim_u',
		  'flux_aper_w', 'flux_aper_lolim_w', 'flux_aper_hilim_w',
		  'flux_powlaw_aper_b', 'flux_powlaw_aper_lolim_b', 'flux_powlaw_aper_hilim_b',
		  'flux_powlaw_aper_w', 'flux_powlaw_aper_lolim_w', 'flux_powlaw_aper_hilim_w',
		  'flux_bb_aper_b', 'flux_bb_aper_lolim_b', 'flux_bb_aper_hilim_b',
		  'flux_bb_aper_w', 'flux_bb_aper_lolim_w', 'flux_bb_aper_hilim_w',
		  'flux_brems_aper_b', 'flux_brems_aper_lolim_b', 'flux_brems_aper_hilim_b',
		  'flux_brems_aper_w', 'flux_brems_aper_lolim_w', 'flux_brems_aper_hilim_w'];
    return masterQueryNear(ra, dec, rmax, cols);
  }

  // Master Source: Variability
  //
  function masterSourceVariabilityNear(ra, dec, rmax) {
    const cols = ['name', 'ra', 'dec',
		  'err_ellipse_r0', 'err_ellipse_r1', 'err_ellipse_ang',
		  'significance', 'likelihood', 'likelihood_class',
		  'conf_flag', 'dither_warning_flag',
		  'sat_src_flag', 'streak_src_flag', 'var_flag',
		  'flux_aper_b', 'flux_aper_lolim_b', 'flux_aper_hilim_b',
		  'flux_aper_w', 'flux_aper_lolim_w', 'flux_aper_hilim_w',
		  'var_intra_index_b', 'var_intra_index_h',
		  'var_intra_index_m', 'var_intra_index_s',
		  'var_intra_index_u', 'var_intra_index_w',
		  'var_intra_prob_b', 'var_intra_prob_h',
		  'var_intra_prob_m', 'var_intra_prob_s',
		  'var_intra_prob_u', 'var_intra_prob_w',
		  'var_inter_index_b', 'var_inter_index_h',
		  'var_inter_index_m', 'var_inter_index_s',
		  'var_inter_index_u', 'var_inter_index_w',
		  'var_inter_prob_b', 'var_inter_prob_h',
		  'var_inter_prob_m', 'var_inter_prob_s',
		  'var_inter_prob_u', 'var_inter_prob_w'];
    return masterQueryNear(ra, dec, rmax, cols);
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
        msg = 'No Virtual Observatory application';
      } else if (n === 1) {
        msg = 'One application';
      } else {
        msg = `${resp.length} applications`;
      }

      msg += ` responded to the ${mtype} request.`;

      if ((n > 0) && (mtype === 'image.load.fits')) {
        msg += '\nWarning: downloading the stack event file can take a long time!';
      }

      sampReport(msg);
    };
  }

  // SAMP message to change position.
  //
  // NOTE: this currently does *NOT* record this location as as
  //       stored location
  function handlePointAtSky(senderId, message, isCall) {
    const params = message['samp.params'];

    sampTrace(`SAMP coord.pointAt.sky sent ra=${params['ra']} dec=${params['dec']}`);

    // Use subtly-different error messages for the two cases.
    //
    const ra = Number(params['ra']);
    const dec = Number(params['dec']);

    sampTrace(`SAMP coord.pointAt.sky -> ra=${ra} dec=${dec}`);

    // This includes ra/dec parameters being undefined
    if (isNaN(ra) || isNaN(dec)) {
      sampReport(`Unsupported coordinates for move:<br/>α=${params['ra']} δ=${params['dec']}`);
      return;
    }

    if ((ra < 0) || (ra >= 360.0) || (dec < -90) || (dec > 90)) {
      sampReport(`Invalid coordinates for move:<br/>α=${params['ra']} δ=${params['dec']}`);
      return;
    }

    wwt.moveTo(ra, dec);
    sampReport(`Moving to α=${ra} δ=${dec}`);
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
            const msg = new samp.Message('coord.pointAt.sky',
                                         {ra: ra.toString(),
                                          dec: dec.toString()});
            conn.notifyAll([msg], handleSAMPResponse('coord.pointAt.sky'));
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

  // We support a limited choice of searches, matching the Master Source
  // searches in CSCView around May 2019:
  //    basic       - Basic Summary
  //    summary     - Summary
  //    photometry  - Photometry
  //    variability - Variability
  //
  const masterSearches = {
    basic: {get: masterSourceBasicNear, label: 'basic summary'},
    summary: {get: masterSourcePropertiesNear, label: 'summary'},
    photometry: {get: masterSourcePhotometryNear, label: 'photometric'},
    variability: {get: masterSourceVariabilityNear, label: 'variability'}
  };

  // Send the 'currently displayed' source properties via SAMP. This
  // actually sends a cone search that should match the filter used
  // to display the sources.
  //
  // ra, dec, and fov are in decimal degrees, and fov is
  // converted to a search radius.
  //
  function sendSourcePropertiesNear(ra, dec, fov, search) {

    let searchURL = typeof search === 'undefined' ?
      masterSearches.basic : masterSearches[search];
    if (typeof searchURL === 'undefined') {
      sampTrace(`ERROR: sendSourcePropertiesNear sent search=${search}`);
      searchURL = masterSearches.basic;
    }

    sampTrace(`SAMP: master search=${search}`);
    sampTrace(`SAMP: source properties near ${ra} ${dec} r= ${fov}`);
    if ((ra === null) || (dec === null) || (fov === null)) {
      console.log('Internal error: missing location');
      return;
    }

    const rmax = fov * 60.0;  // convert to arcmin
    const url = searchURL.get(ra, dec, rmax);
    sendURL('table.load.votable', url,
            `CSC 2.0 ${searchURL.label} source properties (cone-search)`);
  }

  function sendSourcePropertiesName(name) {

    sampTrace(`SAMP: source properties name ${name}`);
    const url = masterSourcePropertiesByName(name);
    sendURL('table.load.votable', url,
            'CSC 2.0 master-source properties (single source)');
  }

  function sendStackEvt3(stack, stackver) {

    sampTrace(`SAMP: stack=${stack} ver=${stackver}`);

    // simple for now
    let verstr;
    if (stackver < 10)       { verstr = '00' + stackver.toString(); }
    else if (stackver < 100) { verstr = '0' + stackver.toString(); }
    else                     { verstr = stackver.toString(); }

    const url = 'http://cda.harvard.edu/csccli/retrieveFile?' +
      `version=cur&filetype=stkevt3&filename=${stack}N${verstr}_evt3.fits`;

    console.log(`--> sending image.load.fits for ${url}`);
    sendURL('image.load.fits', url,
            `Stack evt3 for ${stack}`);
  }

  return { onload: onload,
	   setup: openSAMP,
           teardown: closeSAMP,
	   startPolling: startPolling,
	   stopPolling: stopPolling,

           moveTo: moveTo,

           register: registerSAMP,

           sendSourcePropertiesNear: sendSourcePropertiesNear,
           sendSourcePropertiesName: sendSourcePropertiesName,
           sendStackEvt3: sendStackEvt3,

           // For debugging
           getSAMPConnection: () => sampConnection,

	   hasConnected: () => sampConnection !== null,
	   isRegistered: () => sampIsRegistered,
	   hasHub: () => sampHubIsPresent

         };

})();
