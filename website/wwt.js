'use strict';

/*
 * Based on code from
 * http://www.worldwidetelescope.org/docs/Samples/displaycode.htm?codeExample=WWTWebClientPolyHtml5.html
 * and
 * http://www.worldwidetelescope.org/docs/worldwidetelescopewebcontrolscriptreference.html
 *
 * Additional knowledge gleaned from the ADS All-Sky Survey:
 *   http://www.adsass.org/wwt/
 *
 * There is an issue whereby the WWT initialization doesn't seem to finish,
 * which means our "wwt ready" function isn't called. So we use a timer
 * to manually call the function if it hasn't been executed. This seems to
 * work.
 */

var wwt = (function () {

  // The features available are controlled by default choices (the
  // values of the displayXXX fields below), but they can be over-ridden
  // by the presence of the following tokens as query terms - e.g.
  //   ?csc11,chs,polygon,stack,source
  // This can only "turn on" a field, not turn it off.
  //
  //   - do we display the
  //     - CHS sources
  //     - CSC 1.1 sources
  //     - "select sources with a polygon"
  //     - show nearest stacks
  //     - show nearest sources
  //
  /***
  let displayCHS = false;
  let displayCSC11 = false;
  let displayPolygonSelect = false;
  let displayNearestStacks = false;
  let displayNearestSources = false;
  ***/

  // const displayCHS = true;
  // const displayCSC11 = true;
  // const displayPolygonSelect = true;
  // const displayNearestStacks = true;
  // const displayNearestSources = true;

  // can not use const here in case a user tries ?csc11 (or I need
  // to rewrite more code to better support this)
  let displayCHS = true;
  let displayCSC11 = true;
  let displayPolygonSelect = true;
  let displayNearestStacks = true;
  let displayNearestSources = true;

  // What options has the user provided via query parameters?
  let userLocation = null;
  let userDisplay = null;

  var wwt;

  // keys for local storage values; not guaranteed all in use yet.
  //
  const keySchema = 'wwt-schema';
  const keySave = 'wwt-save';
  const keyLocation = 'wwt-location';
  const keyFOV = 'wwt-fov';
  const keyForeground = 'wwt-foreground';
  const keyCoordinateGrid = 'wwt-grid';
  const keyCrosshairs = 'wwt-crosshairs';
  const keyConstellations = 'wwt-constellations';
  const keyBoundaries = 'wwt-boundaries';
  const keyMilkyWay = 'wwt-milkyway';
  const keyClipboardFormat = 'wwt-clipboardformat';

  // Remove any user-stored values.
  //
  function clearState() {
    const keys = [keySchema,
		  keySave, keyLocation, keyFOV, keyForeground,
		  keyCoordinateGrid,
		  keyCrosshairs, keyConstellations, keyBoundaries,
		  keyMilkyWay, keyClipboardFormat];

    keys.forEach(key => {
      trace(`-- clearing state for key=${key}`);
      window.localStorage.removeItem(key);
    });
  }

  // Save the current setting (if allowed to).
  //
  // Note that we *always* record the keySave setting (even if false),
  // since otherwise it is a completely pointless setting. If keySave
  // is set to false then we remove all other saved values.
  //
  // Should the act of changing keySave / saveStateFlag be included here
  // (as it currently is) or moved out to a separate routine? The
  // saveStateFlag variable isn't really needed.
  // TODO: When changing saveState to True, need to save the settings for
  // a number of fields (e.g. all but position/FOV). This is better done
  // outside of this routine I think.
  //
  var saveStateFlag = true;
  function saveState(key, value) {
    const sval = value.toString();
    if (key === keySave) {
      saveStateFlag = sval === 'true';
      if (!saveStateFlag) { clearState(); }
      window.localStorage.setItem(key, sval);
      return;
    }
    if (!saveStateFlag) { return; }
    window.localStorage.setItem(key, sval);
  }

  // Return the stored value, or null if not set. There is no
  // validation that the key is valid.
  //
  function getState(key) {
    return window.localStorage.getItem(key);
  }

  function setSaveState(flag) {
    saveState(keySave, flag);
  }

  // This is called when the page is first loaded and is intended to support
  // any "breaking change" to the local storage schema between when the
  // user last ran the code and the current version. At the moment this
  // is a no-op (the version is set just in case).
  //
  // It should not be run multiple times (although it probably doesn't matter
  // if it does).
  //
  function updateSchema() {
    trace('Setting schema version to 1');
    window.localStorage.setItem(keySchema, '1');
  }

  // What is the minimum FOV size we want to try and "enforce"?
  // Units are degrees.
  //
  // Note that unless we make storeDisplayState enforce this,
  // we can not guarantee a user doesn't go smaller than this,
  // but the current approach minimises the "damage" a wonky zoom
  // can do.
  //
  // Based on logic in
  // https://worldwidetelescope.gitbooks.io/worldwide-telescope-web-control-script-reference/content/webcontrolobjects.html#wwtcontrol-fov-property
  //
  // const minFOV = 0.00022910934437488727; / /this is about 0.8 arcsec
  const minFOV = 5 / 3600.0;
  const maxFOV = 60; // I think this is the WWT limit

  // Save the current WWT "display", for settings that we don't
  // explicitly track the change of elsewhere:
  //   keyLocation
  //   keyFOV
  //
  // It is expected that this is called periodically.
  //
  // This also updates the #coordinate and #fov displays, and
  // the example URL #example-url on the help page.
  //
  function storeDisplayState() {
    const ra = 15.0 * wwt.getRA();
    const dec = wwt.getDec();
    const fov = wwt.get_fov();

    saveState(keyLocation, ra + ',' + dec);
    if ((fov > minFOV) && (fov < maxFOV)) {
      saveState(keyFOV, fov);
    }

    const url = getPageURL();
    
    const coord = document.querySelector('#coordinate');
    const fovspan = document.querySelector('#fov');
    const exurl = document.querySelector('#example-url');
    if ((coord === null) || (fovspan === null) || (exurl === null)) {
      // Should really only log this once but it's not worth the effort,
      // as this should not happen.
      //
      console.log(`ERROR: unable to find ${coord} ${fovspan} ${exurl}`);
      return;
    }

    // data-ra/dec is used by the copy-to-clipboard action.
    //
    // Use 5 decimal places for both as should be sufficient for
    // the accuracy level we care about with the CSC
    //
    coord.setAttribute('data-ra', ra.toFixed(5));
    coord.setAttribute('data-dec', dec.toFixed(5));

    const hms = wwtprops.raToTokens(ra);
    const dms = wwtprops.decToTokens(dec);
    coord.querySelector('#ra_h').innerText = i2(hms.hours);
    coord.querySelector('#ra_m').innerText = i2(hms.minutes);
    coord.querySelector('#ra_s').innerText = f2(hms.seconds, 2);

    coord.querySelector('#dec_d').innerText = dms.sign + i2(dms.degrees);
    coord.querySelector('#dec_m').innerText = i2(dms.minutes);
    coord.querySelector('#dec_s').innerText = f2(dms.seconds, 1);

    removeChildren(fovspan);

    let fovtxt = '';
    if (fov >= 1.0) {
      fovtxt = fov.toFixed(1) + '°';
    } else if (fov >= (1.0 / 60.0)) {
      fovtxt = (fov * 60.0).toFixed(1) + "'";
    } else {
      fovtxt = (fov * 3600.0).toFixed(1) + '"';
    }
    fovspan.appendChild(document.createTextNode(fovtxt));

    removeChildren(exurl);
    if (url === null) {
      exurl.appendChild(document.createTextNode('oops, unable to create the URL'));
    } else {
      exurl.appendChild(document.createTextNode(url));
    }
  }

  // integer to "xx" format string, 0-padded to the left.
  //
  function i2(x) {
    return x.toString().padStart(2, '0');
  }

  // float to "xx.y" format, where the number of decimal places is ndp
  function f2(x, ndp) {
    return x.toFixed(ndp).padStart(3 + ndp, '0')
  }

  // Add RA and Dec from #coordinates (not from WWT, as I think it may
  // be lightly confusing in case things are moving, and to be honest it
  // shouldn't make much difference as it is hard to get to the clip
  // functionality and still be moving and not expect confusion).
  //
  function clipCoordinates(event) {
    const el = document.querySelector('#coordinate');
    if (el === null) {
      return;
    }
    const ra = el.getAttribute('data-ra');
    const dec = el.getAttribute('data-dec');
    if ((ra === null) || (dec === null)) {
      return;
    }

    copyCoordinatesToClipboard(event, ra, dec);
  }

  // What format to use when converting a location to a string,
  // which will then be added to the clipboard.
  //
  var clipboardFormat = 'degrees';
  const supportedClipboardFormats = ['degrees',
				     'degrees-d',
				     'colons',
				     'letters'];
  function setClipboardFormat(format) {
    if (!supportedClipboardFormats.includes(format)) {
      console.log(`ERROR: clipboard format '${format}' is not supported.`);
      return;
    }
    clipboardFormat = format;
    saveState(keyClipboardFormat, clipboardFormat);
  }

  // Given RA and Dec in decimal degrees, return a string representation
  // (intended for the clip board).
  //
  function coordinateFormat(ra, dec) {
    // Not worried about efficiency here.
    //
    if (!supportedClipboardFormats.includes(clipboardFormat)) {
      console.log(`ERROR: unknown clipboardformat '${clipboardFormat}'`);
      clipboardFormat = 'degrees';
      saveState(keyClipboardFormat, clipboardFormat);
    }

    if (clipboardFormat === 'degrees') {
      return `${ra} ${dec}`;
    } else if (clipboardFormat === 'degrees-d') {
      return `${ra}d ${dec}d`;
    }

    const hms = wwtprops.raToTokens(ra);
    const dms = wwtprops.decToTokens(dec);

    const rah = i2(hms.hours);
    const ram = i2(hms.minutes);
    const ras = f2(hms.seconds, 2);

    const decd = dms.sign + i2(dms.degrees);
    const decm = i2(dms.minutes);
    const decs = f2(dms.seconds, 1);

    if (clipboardFormat === 'colons') {
      return `${rah}:${ram}:${ras} ${decd}:${decm}:${decs}`;
    } else {
      // letters
      return `${rah}h${ram}m${ras}s ${decd}°${decm}'${decs}"`;
      // fix emacs: need an extra '
    }
  }

  function copyCoordinatesToClipboard(event, ra, dec) {
    copyToClipboard(event, coordinateFormat(ra, dec));
  }

  // Create a bookmark for the current location (at least, the
  // same location as 'Clip Location' uses), zoom level,
  // and display. Copy it to the clipboard.
  //
  function getPageURL() {
    const el = document.querySelector('#coordinate');
    if (el === null) {
      return null;
    }
    const ra = el.getAttribute('data-ra');
    const dec = el.getAttribute('data-dec');
    if ((ra === null) || (dec === null)) {
      return null;
    }

    const zoom = wwt.get_fov();

    // What is the current image setting?
    // This logic is repeated several times and should be
    // centralized.
    //
    const sel = document.querySelector('#imagechoice');
    let display = null;
    for (var idx = 0; idx < sel.options.length; idx++) {
      const opt = sel.options[idx];
      if (opt.selected) { display = opt.value; break; }
    }
    if (display === null) { return null; }

    return `${window.location.href}?ra=${ra},dec=${dec},display=${display}`;
  }
  
  function clipBookmark(event) {
    const url = getPageURL();
    if (url === null) { return; }
    copyToClipboard(event, url);
  }

  // Poll the WWT every two seconds for the location and FOV.
  // If the timer has already been started then the routine
  // does nothing.
  //
  var stateTimerID = null;
  function setWWTStatePoll() {
    if (stateTimerID !== null) { return; }
    stateTimerID = window.setInterval(storeDisplayState, 2000)
  }

  /***
   // starting location: Sgr A*
   var ra0 = 266.41684;
   var dec0 = -29.00781;
  ***/

  /***
   // starting location: LMC
   var ra0 = 80.89417;
   var dec0 =  -69.7561;
  ***/

  // starting location: 30 Doradus; just next to LMC
  var ra0 = 84.67665;
  var dec0 = -69.1009;

  var startFOV = 5;

  // What color to draw the selected source
  var selectedSourceColor = 'white';
  var selectedSourceOpacity = 1.0;

  // The CSC2 data is returned as an array of values
  // which we used to convert to a Javascript object (ie
  // one per row) since it makes it easier to handle.
  // However, it bloats memory usage, so we now retain
  // the array data and use the getCSCObject
  // accessor functions.
  //
  // I hard code the expected row order for documentation
  // (and because it is slightly simpler), but this could
  // be set from the input data.
  //
  const catalogDataCols = [
    'name',
    'ra',
    'dec',
    'err_ellipse_r0',
    'err_ellipse_r1',
    'err_ellipse_ang',
    'conf_flag',
    'sat_src_flag',
    'acis_num',
    'hrc_num',
    'var_flag',
    'significance',
    'fluxband',
    'flux',
    'flux_lolim',
    'flux_hilim',
    'nh_gal',
    'hard_hm',
    'hard_hm_lolim',
    'hard_hm_hilim',
    'hard_ms',
    'hard_ms_lolim',
    'hard_ms_hilim'
  ];

  // Given a row of catalogData, return the given column value,
  // where column must be a member of catalogDataCols.
  //
  // row should catalogData[i] not i (does array access take much
  // time in JS?)
  //
  function getCSCColIdx(column) {
    const colidx = catalogDataCols.indexOf(column);
    if (colidx < 0) {
      console.log(`ERROR: unknown CSC column "${column}"`);
      return null;
    }
    return colidx;
  }

  // Convert a row to an object, to make data access easier.
  //
  function getCSCObject(row) {
    const out = Object.create({});
    zip([catalogDataCols, row]).forEach(el => { out[el[0]] = el[1] });
    return out

  }

  // Indexes into the CSC 2.0 data array
  const raIdx = getCSCColIdx('ra');
  const decIdx = getCSCColIdx('dec');

  // Create an annotation "object" representing a source.
  // Really should make the add/remove code only call the WWT code once.
  //
  function makeAnnotation(data, pos, shp) {
    return { add: () => wwt.addAnnotation(shp),
	     remove: () => wwt.removeAnnotation(shp),
	     data: data,
	     ra: pos.ra,
	     dec: pos.dec,
	     ann: shp };
  }

  // Return the WWT annotation for a source, which is currently a
  // circle.
  //
  function makeCircle(ra, dec, size, lineWidth, lineColor,
		      fillColor, fillFlag, opacity) {
    const cir = wwt.createCircle(fillFlag);
    cir.setCenter(ra, dec);
    cir.set_skyRelative(true);
    cir.set_radius(size);
    cir.set_lineWidth(lineWidth);
    cir.set_lineColor(lineColor);
    cir.set_fillColor(fillColor);
    cir.set_opacity(opacity);
    return cir;
  }

  // Note: set fill color if it has not been processed yet - not ideal
  //       as no way to change this color.
  //
  // Sent in an object, since it is also used to create the plot
  // properties, rather than the raw array.
  //
  function makeSource(color, size, src) {
    if ((src.ra === null) || (src.dec === null)) {
      console.log('Err, no location for source:');
      console.log(src);
      return null;
    }

    // Use nh as a proxy for whether we have the source properties or not
    const unprocessed = src.nh_gal === null;

    const lineColor = unprocessed ? 'grey' : color;
    const fillColor = unprocessed ? 'grey' : 'white';

    const ann = makeCircle(src.ra, src.dec, size, 1,
			   lineColor, fillColor, true, 0.1);

    // Note: add a label to indicate that this is unprocessed, so we know not to
    //       change the color later.
    //
    if (unprocessed) {
      ann.set_label('unprocessed');
    }

    return ann;
  }

  function makeSource11(color, size, src) {
    if ((src.ra === null) || (src.dec == null)) {
      console.log('Err, no location for CSC 1.1 source:');
      console.log(src);
      return null;
    }

    return makeCircle(src.ra, src.dec, size, 1,
		      color, color, true, 0.1);
  }

  function makeXMMSource(color, size, src) {
    const ra = src[0];
    const dec = src[1];
    if ((ra === null) || (dec === null)) {
      console.log('Err, no location for XMM source:');
      console.log(src);
      return null;
    }

    return makeCircle(ra, dec, size, 1,
                      color, color, true, 0.1);
  }

  // Store data about the supported catalogs.
  //    color, size  - how they are displayed (size in arcseconds)
  //    data         - catalog data, or null
  //    getPos       - return ra and dec given an element of data
  //    annotations  - empty or a list of shown items, where each item
  //                   is the output of makeAnnotation.
  //
  //    makeShape is a function that takes color, size, data item
  //      and returns a WWT annotation.
  //
  const catalogProps = {
    csc20: { label: 'CSC2.0', button: '#togglesources',
             changeWidget: '#sourceprops',
             color: 'cyan', size: 5.0 / 3600.0,
	     loaded: false, data: null,
	     getPos: (d) => { return { ra: d[raIdx], dec: d[decIdx] }; },
	     makeShape: makeSource,
             annotations: null },
    csc11: { label: 'CSC1.1', button: '#togglesources11',
             changeWidget: 'source11props',
             color: 'orange', size: 7.0 / 3600.0,
	     loaded: false, data: null,
	     getPos: (d) => { return { ra: d.ra, dec: d.dec }; },
	     makeShape: makeSource11,
             annotations: null },
    xmm: { label: 'XMM', button: '#toggleXMMsources',
           changeWidget: 'xmmsourceprops',
           color: 'green', size: 10.0 / 3600.0,
	   loaded: false, data: null,
	   getPos: (d) => { return { ra: d[0], dec: d[1] }; },
	   makeShape: makeXMMSource,
           annotations: null }
  };

  var nearestSource = [];

  // Was originally passing around the stack data to the functions
  // that needed it, but now store it.
  //
  var inputStackData = undefined;

  // store the stack annotations (there can be multiple polygons per
  // stack)
  //
  var stackAnnotations = {};
  var nearestFovs = [];

  var stacksShown = false;

  // add this to a URL and, hey presto, as long as you don't call it
  // too often, we stop the cache.
  //
  function cacheBuster() {
      return '?' + (new Date()).getTime();
  }

  // Return the WWT div, or null (which indicates a serious problem).
  //
  function getHost() {
    const host = document.querySelector('#WorldWideTelescopeControlHost');
    if (host === null) {
      console.log('INTERNAL ERROR: #WorldWideTelescopeControlHost not found!');
    }
    return host;
  }

  // Taken from https://stackoverflow.com/a/10284006
  //
  function zip(arrays) {
    return arrays[0].map(function(_, i){
      return arrays.map(function(array) { return array[i]; })
    });
  }

  function setCoordinateGrid(flag) {
    wwt.settings.set_showGrid(flag);
    wwt.settings.set_showEquatorialGridText(flag);
    saveState(keyCoordinateGrid, flag);
  }

  function setCrosshairs(flag) {
    wwt.settings.set_showCrosshairs(flag);
    saveState(keyCrosshairs, flag);
  }

  function setConstellations(flag) {
    wwt.settings.set_showConstellationFigures(flag);
    saveState(keyConstellations, flag);
  }

  function setBoundaries(flag) {
    wwt.settings.set_showConstellationBoundries(flag);
    saveState(keyBoundaries, flag);
  }

  // How are the toggle items handled?
  //
  // Need to look into when the Milky Way is read in, since if it
  // is asynchronous this complicates the "save settings" logic.
  //
  // Note: togglesavestate must be first (we rely on this being
  // processed first when resetting the state).
  //
  // Note: the defval values are used to restore the default settings,
  //       so it is required that they be kept up to date with wwt.xml
  //       (they could be set from the HTML on load, but for now leave
  //       that).
  //
  // This started out only supporting checkboxes, but now also want
  // to support option lists.
  //
  const toggleInfo = [
    {key: keySave, sel: '#togglesavestate',
     change: setSaveState, defval: true},
    {key: keyClipboardFormat, sel: '#clipboardformat',
     change: setClipboardFormat, defval: 'degrees'},
    {key: keyCoordinateGrid, sel: '#togglegrid',
     change: setCoordinateGrid, defval: true},
    {key: keyCrosshairs, sel: '#togglecrosshair',
     change: setCrosshairs, defval: true},
    {key: keyConstellations, sel: '#toggleconstellations',
     change: setConstellations, defval: true},
    {key: keyBoundaries, sel: '#toggleboundaries',
     change: setBoundaries, defval: false},
    {key: null, sel: '#togglebanners',
     change: showBanners, defval: true},
    {key: null, sel: '#togglefullscreen',
     change: setFullScreen, defval: false},
    {key: null, sel: '#togglemw',
     change: showMW, defval: false}];

  // Change all the settings to the defval of toggleInfo
  //
  // Should this change "other" settings, such as location, fov,
  // and the chosen background? I think this would be confusing,
  // and we can at least define this as only changing the values
  // in the settings window.
  //
  function resetSettings() {

    toggleInfo.forEach(o => {
      const el = document.querySelector(o.sel);
      if (el === null) {
	console.log(`ERROR: unable to find toggle element ${o.sel}`);
	return;
      }

      let evtype = null;
      if (el.tagName === 'SELECT') {
	evtype = 'change';
	for (var idx = 0; idx < el.options.length; idx++) {
	  const opt = el.options[idx];
	  if (opt.value === o.defval) { opt.selected = true; }
	}
      } else {
	evtype = 'click';
	if (el.checked !== o.defval) {
	  el.checked = o.defval;
	}
      }

      // Fire the event whether it was changed or not, to ensure the
      // value is saved.
      //
      // Can I not just use el.click()?
      try {
	trace(` firing event=${evtype} for ${o.sel}`);
	el.dispatchEvent(new CustomEvent(evtype));
      }
      catch (e) {
	console.log(`ERROR: Unable to send ${evtype} event to ${o.sel}`);
      }
    });
  }

  // Change the zoom level if it is not too small or large
  //
  function zoom(fov) {
    if (fov < minFOV) { return; }
    if (fov > maxFOV) { return; }
    let ra = 15.0 * wwt.getRA();
    let dec = wwt.getDec();
    wwt.gotoRaDecZoom(ra, dec, fov, false);
  }

  const zoomFactor = 1.25;
  function zoomIn() {
    var fov = wwt.get_fov() / zoomFactor;
    zoom(fov);
  }

  function zoomOut() {
    var fov = zoomFactor * wwt.get_fov();
    zoom(fov);
  }

  // zoom factor to use has been guessed at
  function zoomToStack(stackname) {
    for (var stack of inputStackData.stacks) {
      if (stack.stackid !== stackname) { continue; }
      wwt.gotoRaDecZoom(stack.pos[0], stack.pos[1], 1.0, false);
      wwtsamp.moveTo(stack.pos[0], stack.pos[1]);
      return;
    }
  }

  function zoomToSource(sourcename) {

    // Slightly optimise the name query as could be called
    // many times. Do not bother with ra/dec as only
    // called once.
    //
    const nameIdx = getCSCColIdx('name');
    if (nameIdx === null) {
      return;
    }

    for (var src of catalogProps.csc20.data) {
      const sname = src[nameIdx];
      if (sname !== sourcename) { continue; }

      const ra = src[raIdx];
      const dec = src[decIdx];
      wwt.gotoRaDecZoom(ra, dec, 0.06, false);
      wwtsamp.moveTo(ra, dec);
      return;
    }
  }

  // Can we identify whether this source has been processed or not
  // (and, if not, do not change it)? For now use a label
  // to indicate it is unprocessed.
  //
  // Note that the CSC 2.0 values (currently) have processed vs
  // unprocessed, but also we are not setting the fill color,
  // which is different from the other catalogs.
  //
  function colorUpdate(val) {
    const props = catalogProps.csc20;

    const color = '#' + val;
    props.color = color;
    if (props.annotations === null) { return; }
    props.annotations.forEach(d => {
      const cir = d.ann;
      var x = cir.get_label();
      if (typeof x === 'undefined') {
        cir.set_lineColor(color);
        // cir.set_fillColor(color);
      }
    });
  }

  // Return a function that updates the color of the given
  // set of annotations. properties is an object with color
  // and annotations fields.
  //
  function makeColorUpdate(props) {
    return (val) => {
      const color = '#' + val;
      props.color = color;
      if (props.annotations === null) { return; }
      props.annotations.forEach(d => {
        const cir = d.ann;
        cir.set_lineColor(color);
        cir.set_fillColor(color);
      });
    };
  }

  const colorUpdate11 = makeColorUpdate(catalogProps.csc11);
  const xmmColorUpdate = makeColorUpdate(catalogProps.xmm);

  // Return a function that updates the size of the given
  // set of annotations. properties is an object with size
  // and annotations fields.
  //
  function makeSizeUpdate(props) {
    return (newSize) => {
      if (newSize <= 0) {
        console.log(`ERROR: Invalid source size: [${newSize}]`);
        return;
      }

      const size = newSize * 1.0 / 3600.0;
      props.size = size;
      if (props.annotations === null) { return; }
      props.annotations.forEach(d => d.ann.set_radius(size));
    };
  }

  const changeSourceSize = makeSizeUpdate(catalogProps.csc20);
  const changeSource11Size = makeSizeUpdate(catalogProps.csc11);
  const changeXMMSourceSize = makeSizeUpdate(catalogProps.xmm);

  // From
  // https://hackernoon.com/copying-text-to-clipboard-with-javascript-df4d4988697f
  // Also comments from
  // https://hackernoon.com/you-need-to-discover-the-awesome-clipboard-web-api-12b248d05dd3
  //
  // You probably want to wrap document.execCommand in a try/catch block.
  // In some browsers it will throw an error on failures.
  //
  // You can inspect the result of execCommand to see if it worked or not.
  // It returns a Boolean that relates to the success of the command.
  //
  const copyToClipboardAction = str => {
    const el = document.createElement('textarea');
    el.value = str;
    el.setAttribute('readonly', '');
    el.style.position = 'absolute';
    el.style.left = '-9999px';
    document.body.appendChild(el);
    const selected =
          document.getSelection().rangeCount > 0
          ? document.getSelection().getRangeAt(0)
          : false;
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    if (selected) {
      document.getSelection().removeAllRanges();
      document.getSelection().addRange(selected);
    }
  };

  // Display the text that is being copied (so that the used can do
  // something with it, and to let them know that something has happened).
  //
  // The inspiration are systems like stackoverflow's "share this page"
  // interface. Let's see how it goes.
  //
  function copyToClipboard(event, str) {

    // Copy to the clipboard before trying to be clever, so that we
    // know this has happened (assuming there is support).
    //
    copyToClipboardAction(str);

    const host = getHost();
    if (host === null) { return; }
    const parent = document.createElement('div');
    parent.setAttribute('class', 'share');

    parent.appendChild(addCloseButton(() => host.removeChild(parent)));
    
    const intro = document.createElement('p');
    intro.appendChild(document.createTextNode('Copied to clipboard:'));
    parent.appendChild(intro);
    
    const text = document.createElement('input');
    text.setAttribute('type', 'text');
    text.setAttribute('value', str);
    parent.appendChild(text);

    host.appendChild(parent);
    
    // Position relative to event. The issue is that we have to
    // worry about falling off the screen.
    //
    // Are these values available and reliable at this time?
    //
    // If the display is too narrow or tall then remove this
    // element.
    //
    // Use getBoundingClientRect or offsetWidth/Height values?
    //
    const parentbbox = parent.getBoundingClientRect();
    const hostbbox = parent.parentElement.getBoundingClientRect();

    const xmin = 0;
    const ymin = 0;
    const xmax = hostbbox.width - parentbbox.width;
    const ymax = hostbbox.height - parentbbox.height;

    if ((xmax <= 0) || (ymax <= 0)) {
      trace('Unable to place share box so skipping');
      host.removeChild(parent);
      return;
    }
    
    let x = event.clientX;
    let y = event.clientY;

    if (x > xmax) { x = xmax; }
    if (y > ymax) { y = ymax; }
    
    parent.style.left = `${x}px`;
    parent.style.top = `${y}px`;
  }

  // This updates the stackAnnotations dict
  //
  function addStackFOV(stack) {

    let edgeColor;
    let fillColor = 'white';
    let lineWidth;
    const opacity = 0.6;
    const fillFlag = false;

    if (stack.status) {
      edgeColor = 'gold';
      lineWidth = 2;
    } else {
      edgeColor = 'grey';
      lineWidth = 1;
    };

    const annotations = [];
    // var ctr = 1;
    for (var i = 0; i < stack.polygons.length; i++) {

      // First is inclusive, the rest are exclusive
      const shapes = stack.polygons[i];

      for (var j = 0; j < shapes.length; j++) {
        const fov = wwt.createPolygon(fillFlag);

        /*
         * Belinda sees odd behavior when zooming in; it
         * seems to try to follow a link that looks like
         * it is coming from a label on the annotation,
         * so so not try setting them (as they don't
         * do anything anyway).
         *
         var lbl = 'fov_' + ctr + '_' + j + '_' + stack.stackid;
         fov.set_id(lbl);
         fov.set_label(stack.stackid);
         fov.set_showHoverLabel(true);
        */

        fov.set_lineColor(edgeColor);
        fov.set_lineWidth(lineWidth);

        fov.set_fillColor(fillColor);
        fov.set_opacity(opacity);

        const polygon = shapes[j];
        for (var p in polygon) {
          fov.addPoint(polygon[p][0], polygon[p][1]);
        }

        wwt.addAnnotation(fov);
        annotations.push(fov);

        // ctr += 1;
      }
    }

    stackAnnotations[stack.stackid] = annotations;
  }

  // timeout is in seconds; a value <= 0 means no timeout
  //
  // Safari version 9 (macOS 10.9 I think) doesn't seem to support
  // default parameter values, so do not use for now.
  //
  // function reportUpdateMessage(msg, timeout=10) {
  function reportUpdateMessage(msg, timeout) {

    if (typeof timeout === 'undefined') { timeout = 10; }

    const pane = document.querySelector('#stackUpdateStatus');
    pane.innerHTML = msg;
    pane.style.display = 'inline-block';

    if (timeout <= 0) { return; }

    const cb = () => { pane.style.display = 'none' };
    setTimeout(cb, timeout * 1000);
  }

  // Let's see how the WWT does with all the stacks
  function addFOV(stackdata) {
    for (let stack of stackdata.stacks) {
      addStackFOV(stack);
    }
    stacksShown = true;

    trace('Added FOV');
  }

  // Add outlines based on the Milky Way, data is from the
  // d3-celestial project - https://github.com/ofrohn/d3-celestial -
  // which converted the original Milky Way Outline Catalogs data
  // by Jose R. Vieira - http://www.skymap.com/milkyway_cat.htm
  //
  // The input data is in GeoJSON form, which means the input
  // data has to be converted from lon,lat to RA,Dec
  //
  function lonlat2radec(coords) {
    var ra = coords[0];
    if (ra < 0) { ra += 360; }
    return [ra, coords[1]];
  }

  // This requires that mw be set up already.
  //
  var mwOutlines = [];
  function addMW() {

    if (mwOutlines.length !== 0) {
      console.log('MW already added in!');
      return;
    }

    // Can you tell I don't JavaScript?
    if ((typeof mw.type === 'undefined') ||
        (mw.type !== 'FeatureCollection') ||
        (typeof mw.features === 'undefined')) {
      console.log('Unable to parse MW JS data!');
      return;
    }

    var edgeColor = 'white';
    var lineWidth = 1;
    var fillFlag = false;

    // Create annotations and then, once all processed,
    // add them to WWT.
    //
    // Should we skip some of the layers? For instance, I think
    // most of id=ol1 isn't actually shown by WWT (as the polyline
    // is too large).
    //
    // var ctr = 1;
    //
    // mw is a global variable
    //
    for (var f = 0; f < mw.features.length; f++) {

      var features = mw.features[f];
      if ((typeof features.type === 'undefined') ||
          (features.type !== 'Feature') ||
          (typeof features.id === 'undefined') ||
          (typeof features.geometry === 'undefined') ||
          (typeof features.geometry.type === 'undefined') ||
          (features.geometry.type !== 'MultiPolygon')) {
        console.log('MW problem with feature ' + f.toString());
        return;
      }

      var coords = features.geometry.coordinates;
      if (typeof coords === 'undefined') {
        console.log('MW no coordinates for feature ' + f.toString());
        return;
      }
      if (coords.length !== 1) {
        console.log('MW feature ' + f.toString() +
                    ' length=' + coords.length.toString());
        return;
      }

      coords = coords[0];
      for (var j = 0; j < coords.length; j++) {

        // var outline = wwt.createPolygon(fillFlag);
        var outline = wwt.createPolyLine(fillFlag);

        /*
         * For now don't add an id/label based on issues
         * with the stack labels (see notes there).
         *
         var lbl = 'MW_' + ctr + '_' + j + '_' + features.id;
         outline.set_id(lbl);
         outline.set_label(features.id);
         outline.set_showHoverLabel(true);
        */

        outline.set_lineColor(edgeColor);
        outline.set_lineWidth(lineWidth);

        // outline.set_fillColor(fillColor);
        // outline.set_opacity(opacity);

        var polygon = coords[j];
        for (var p in polygon) {
          var cs = lonlat2radec(polygon[p]);
          outline.addPoint(cs[0], cs[1]);
        }

        mwOutlines.push(outline);

        // ctr += 1;
      }
    }

    trace('Added MW');
  }

  // This does not check that the annotations are in the correct state.
  //
  function showMW(flag) {
    let func = flag ? wwt.addAnnotation : wwt.removeAnnotation;
    mwOutlines.forEach(func);
  }

  // Display the header/footer banners.
  //
  // At present always show on load (as probably a SI requirement).
  //
  function showBanners(flag) {
    const func = flag ? showBlockElement : hideElement;
    func('cxcheaderright');

    // Just find the first p within the footer
    const el = document.querySelector('#cxcfooterright p');
    if (el === null) { return; }
    el.style.display = flag ? 'block' : 'none';
  }

  /* Note that the full-screen mode can be changed
     by means other than the user selecting the option - that is,
     the full-screen mode can be turned off by hitting the escape
     key or causing a new tab to open.
     This means that we can't guarantee that we know what the
     state is here, unless we try to keep track of these
     other changes (i.e. by the window resize event) and ensuring
     that the selected state is kept correct.

   */
  function setFullScreen(flag) {
    wwtscreen.toggleFullScreen(flag);
  }

  // NOTE: do not include the leading '#' in the element name.
  //
  function showBlockElement(name) {
    setDisplay(name, 'block');
  }

  function hideElement(name) {
    setDisplay(name, 'none');
  }

  function setDisplay(name, display) {
    const sel = '#' + name;
    const el = document.querySelector(sel);
    if (el !== null) {
      el.style.display = display;
    } else {
      console.log(`Internal error: unable to find "${sel}"`);
    }
  }

  // Download some JSON, process it, and handle the spinner and
  // toggling of items. On error the spinner is stopped but not
  // much else is done.
  //
  // url is the URL to GET (no attempt to add a cache-busting
  // identifier is made in this routine)
  // toggleSel is the id of the element to toggle (if not null)
  // dataLabel is the label for the element (e.g. 'XMM catalog')
  // and is only usd if toggleSel is not null
  // processData is sent the downloaded JSON
  //
  // QUS: should the spinner be optional?
  //
  function makeDownloadData(url, toggleSel, dataLabel, processData) {

    return () => {
      const req = new XMLHttpRequest();
      if (!req) {
	console.log('ERROR: unable to create a request object!');

	if (toggleSel !== null) {
	  document.querySelector(toggleSel)
            .innerHTML = `Unable to load ${dataLabel}`;
	}
	return;
      }

      startSpinner();
      req.addEventListener('load', () => {
	trace(`-- downloaded: ${url}`);
	processData(req.response);
	stopSpinner();
      }, false);
      req.addEventListener('error', () => {
	trace(`-- error downloading: ${url}`);
	stopSpinner();
      }, false);

      req.open('GET', url);
      req.responseType = 'json';
      req.send();
    };
  }

  function downloadCatalog20Data() {

    // number of chunks for the source properties
    const NCHUNK = 8;
    const chunks = new Array(NCHUNK).fill(false);

    // Have to be careful about scoping rules, so make a function
    // that returns a function to process the chunk
    //
    const processChunk = (x) => (d) => { processCatalogData(chunks, x, d); };

    for (var ctr = 1; ctr <= NCHUNK; ctr++) {
      // Try without any cache-busting identifier
      const url = 'wwtdata/wwt_srcprop.' + ctr.toString() + '.json.gz';
      const func = makeDownloadData(url, '#togglesources',
				    'CSC2.0 catalog',
				    processChunk(ctr));
      func();
    }
  }

  // VERY experimental: load in the ensemble data for CXC testing
  //
  const downloadEnsData = makeDownloadData('wwtdata/ens.json.gz',
					   null, null,
					   processEnsData);

  // VERY experimental
  // stick in a cache-busting identifier to help
  const downloadCHSData = makeDownloadData('wwtdata/chs.json' +
					   cacheBuster(),
					   '#togglechs',
					   'CHS data',
					   processCHSData);

  const downloadCatalog11Data = makeDownloadData('wwtdata/csc1.json.gz',
						 '#togglesources11',
						 'CSC1.1 catalog',
						 processCatalog11Data);

  const downloadXMMData = makeDownloadData('wwtdata/xmm.json.gz',
					   '#toggleXMMsources',
					   'XMM catalog',
					   processXMMData);

  // Load in (asynchronously) the mapping between stack name and the
  // version number of the stack event file available in the archive.
  //
  var stackEventVersions = null;
  const loadStackEventVersions = makeDownloadData('wwtdata/version.stkevt3.json',
						  null, null,
						  (d) => { stackEventVersions = d; });

  // Create the function to show the catalog.
  //   properties is the catalogProps.catalog field
  //
  function makeShowCatalog(props) {
    return () => {
      if (!props.loaded) {
        console.log(`Internal error: showCatalog ${props.label} ` +
                    ' called when no data exists!');
        return;
      }

      // Shouldn't be any shown, but just in case.
      //
      if (props.annotations !== null) {
        props.annotations.forEach(ann => ann.remove());
        props.annotations = null;
      }

      const ra0 = 15.0 * wwt.getRA(); // convert from hours
      const dec0 = wwt.getDec();
      const fov = wwt.get_fov();

      const toStore = (d, pos) => {
	const shp = props.makeShape(props.color, props.size, d);
	const ann = makeAnnotation(d, pos, shp);
	ann.add();
	return ann;
      };

      const shown = findNearestTo(ra0, dec0, fov, props.data,
				  props.getPos, toStore);
      if (shown.length === 0) {
        reportUpdateMessage(`No ${props.label} sources found in ` +
                            'this area of the sky.');
        return;
      }

      // remove the separation value
      props.annotations = shown.map(d => d[1]);

      document.querySelector(props.button).innerHTML =
        `Hide ${props.label} Sources`;
    };
  }

  // Create the function to hide the catalog.
  //   properties is the catalogProps.catalog field
  //
  function makeHideCatalog(props) {
    return () => {
      if (!props.loaded) {
        console.log(`Internal error: hideCatalog ${props.label} ` +
                    'called when no data exists!');
        return;
      }

      if (props.annotations === null) {
        console.log(`Internal error: hideCatalog ${props.label} ` +
                    'called when no data plotted!');
        return;
      }

      props.annotations.forEach(ann => ann.remove());
      props.annotations = null;

      document.querySelector(props.button).innerHTML =
        `Show ${props.label} Sources`;

      hideElement(props.changeWidget);

    };
  }

  // properties is the element in catalogProps
  // download is the download function to call (no arguments);
  //   it must set the annotations field of the properties object
  // show is the function to show the sources, hide to hide them
  // (no arguments); if these are undefined then use
  // makeShowCatalog/makeHideCatalog to create them.
  //
  function makeToggleCatalog(props, download, show, hide) {

    if (typeof show === 'undefined') {
      show = makeShowCatalog(props);
    }

    if (typeof hide === 'undefined') {
      hide = makeHideCatalog(props);
    }

    return () => {
      if (!props.loaded) {
        const el = document.querySelector(props.button);
        el.innerHTML = `Loading ${props.label} Sources`;
        el.disabled = true;

        download();
        return;
      }

      if (props.annotations === null) {
        show();
      } else {
        hide();
      }
    };
  }

  const toggleSources = makeToggleCatalog(catalogProps.csc20,
                                          downloadCatalog20Data,
                                          showSources,
                                          hideSources);
  const toggleSources11 = makeToggleCatalog(catalogProps.csc11,
                                            downloadCatalog11Data);
  const toggleXMMSources = makeToggleCatalog(catalogProps.xmm,
                                             downloadXMMData);

  // manual version of CHS toggle code
  //
  var shownCHS = false;
  function toggleCHS() {
    if (chsData === null) {
      const el = document.querySelector('#togglechs');
      el.innerHTML = 'Loading CHS Sources';
      el.disabled = true;

      downloadCHSData();
      return;
    }

    if (shownCHS === false) {
      showCHS();
      addAnnotationClicked();
    } else {
      hideCHS();
      removeAnnotationClicked();
      const pane = document.querySelector('#chs');
      pane.style.display = 'none';
    }
  }

  // Show all CHS
  //
  function showCHS() {
    if (annotationsCHS == null) {
      console.log('Internal error: showCHS ' +
                  ' called when no data exists!');
      return;
    }

    // This assumes they are not already shown
    // annotationsCHS.forEach(wwt.addAnnotation);
    annotationsCHS.forEach(anns => {
      wwt.addAnnotation(anns[0]);
      wwt.addAnnotation(anns[1]);
    });

    document.querySelector('#togglechs').innerHTML =
      'Hide CHS';
    shownCHS = true;
  }

  function hideCHS() {
    if (annotationsCHS == null) {
      console.log('Internal error: hideCHS ' +
                  ' called when no data exists!');
      return;
    }

    // This assumes they are being shown
    // annotationsCHS.forEach(wwt.removeAnnotation);
    annotationsCHS.forEach(anns => {
      wwt.removeAnnotation(anns[0]);
      wwt.removeAnnotation(anns[1]);
    });

    document.querySelector('#togglechs').innerHTML =
      'Show CHS';
    shownCHS = false;
  }

  function toggleSourceProps(event, elname) {
    const sel = '#' + elname;
    const el = document.querySelector(sel);
    if (el === null) {
      console.log(`Internal error: unable to find "${elname}"`);
      return;
    }

    // Assume that initially (when style.display is '') that
    // the item is hidden by a CSS rule. So, if it is set to
    // 'flex' then we know it has to be hidden, otherwise shown.
    //
    var style;
    if (el.style.display === 'flex') {
      style = 'none';
    } else {
      style = 'flex';
    }

    // el.style.left = `${event.clientX + 5}px`;
    el.style.top = `${event.clientY}px`;

    el.style.display = style;
  }

  // Show the settings pane.
  //
  var showSettingsFlag = false;
  function toggleSettings(event) {
    if (showSettingsFlag) { hideSettings(); }
    else { showSettings(event); }
  }

  function hideSettings() {
    hideElement('settings');
    document.querySelector('#togglesettings').innerHTML =
      'Show Settings';
    showSettingsFlag = false;
  }

  function showSettings(event) {

    var pane = document.querySelector('#settings');

    // Trying to work out a good place to start the pane
    //
    // these are platform/font dependent...
    // pane.style.left = '16em';
    // pane.style.top = '4em';

    // Base the starting position off the client click, but
    // offset slightly in Y since there should be space above but
    // may not be as much space below. Could make this depend on
    // the height of pane, but don't want to go to that much effort
    // if not necessary.
    //
    // The horizontal space is so that the user can still click
    // the toggle button (to hide the new pane) without having to
    // move her mouse left.
    //
    pane.style.left = `${event.clientX + 5}px`;
    pane.style.top = `${event.clientY - 40}px`

    pane.style.display = 'block';

    document.querySelector('#togglesettings').innerHTML =
      'Hide Settings';
    showSettingsFlag = true;
  }

  // Show the pane with the buttons that move to a location.
  //
  // I want this to appear near where the user clicked - hence sending
  // in the event - but it requires some cross-platform work so punting
  // for now.
  //
  var showPre = false;
  function togglePreSelected(event) {
    if (showPre) {
      hidePreSelected();
    } else {
      showPreSelected(event);
    }
  }

  function hidePreSelected() {
    hideElement('preselected');
    document.querySelector('#togglepreselected').innerHTML =
      'Show Popular Places';
    showPre = false;
  }

  function showPreSelected(event) {
    var pane = document.querySelector('#preselected');

    // Trying to work out a good place to start the pane
    //
    // pane.style.left = evpos.x.toString() + 'px';
    // pane.style.top = evpos.y.toString() + 'px';

    // these are platform/font dependent...
    // pane.style.left = '16em';
    // pane.style.top = '4em';

    // See discussion in showSettings
    pane.style.left = `${event.clientX + 5}px`;
    pane.style.top = `${event.clientY - 40}px`;

    pane.style.display = 'block';
    document.querySelector('#togglepreselected').innerHTML =
      'Hide Popular Places';
    showPre = true;
  }

  function toggleStacks() {
    let func, label, selMode;
    if (stacksShown) {
      func = wwt.removeAnnotation;
      label = 'Show Stack Outlines';
      stacksShown = false;
      selMode = 'nothing'; /* pick nothing as the best choice here */
    } else {
      func = wwt.addAnnotation;
      label = 'Hide Stack Outlines';
      stacksShown = true;
      selMode = 'stack';
    }

    for (var stack in stackAnnotations) {
      var fovs = stackAnnotations[stack];
      for (var i = 0; i < fovs.length; i++) {
        func(fovs[i]);
      }
    }

    // could cache this
    document.querySelector('#togglestacks').innerHTML = label;

    // Only needed on 'hide stack' but do for both.
    clearNearestStack();

    const sel = document.querySelector('#selectionmode');
    for (var idx = 0; idx < sel.options.length; idx++) {
      const opt = sel.options[idx];
      if (opt.value === 'stack') {
	opt.disabled = !stacksShown;
      }
      if (opt.value === selMode) {
	opt.selected = true;
      }
    }

    try {
      sel.dispatchEvent(new CustomEvent('change'));
    }
    catch (e) {
      console.log('INTERNAL ERROR: unable to change selection mode: ' + e);
    }
  }

  // Note: this *can* be called before the sources are loaded
  //       (primarily when zooming to a new location)
  //
  function hideSources() {
    _hideSources();

    // could cache these
    if (catalogProps.csc20.loaded) {
      // assume that the label can only have been changed
      // if the sources have been loaded
      document.querySelector('#togglesources').innerHTML =
        'Show CSC2.0 Sources';
    }

    const sampEl = document.querySelector('#export-samp');
    sampEl.classList.remove('requires-samp');
    sampEl.style.display = 'none';

    ['plot-properties', 'sourceprops', 'plot'].forEach(hideElement);

    // Not 100% convinced whether we want this
    // wwtprops.clearSourceInfo();
    clearNearestSource();

    // What is the best option to switch to here:
    // stack or nothing?
    //
    const switchTo = stacksShown ? 'stack' : 'nothing';

    const sel = document.querySelector('#selectionmode');
    for (var idx = 0; idx < sel.options.length; idx++) {
      const opt = sel.options[idx];
      if ((opt.value === 'source') || (opt.value === 'polygon')) {
	opt.disabled = true;
      } else if (opt.value === switchTo) {
	opt.selected = true;
      }
    }

    try {
      sel.dispatchEvent(new CustomEvent('change'));
    }
    catch (e) {
      console.log('INTERNAL ERROR: unable to change selection mode: ' + e);
    }

  }

  function _hideSources() {

    const props = catalogProps.csc20;
    if (props.annotations !== null) {
      props.annotations.forEach(ann => ann.remove());
      props.annotations = null;
    }

    if (typeof sourceCircle !== 'undefined') {
      wwt.removeAnnotation(sourceCircle);
      sourceCircle = undefined;
    }

    sourceRA = undefined;
    sourceDec = undefined;
    sourceFOV = undefined;

    sourcePlotData = null;
  }

  function showSources() {
    const flag = _showSources();
    if (!flag) {
      reportUpdateMessage('No CSC 2.0 sources found in this area of the sky.');
      return;
    }

    // could cache these
    document.querySelector('#togglesources').innerHTML =
      'Hide CSC2.0 Sources';

    // Let the "is SAMP enabled" check sort out the display of this
    document.querySelector('#export-samp')
      .classList.add('requires-samp');

    showBlockElement('plot-properties');

    const sel = document.querySelector('#selectionmode');
    for (var idx = 0; idx < sel.options.length; idx++) {
      const opt = sel.options[idx];
      if (opt.value === 'source') {
	opt.disabled = false;
	opt.selected = true;
      } else if (opt.value === 'polygon') {
	opt.disabled = false;
      }
    }

    try {
      sel.dispatchEvent(new CustomEvent('change'));
    }
    catch (e) {
      console.log('INTERNAL ERROR: unable to change selection mode: ' + e);
    }

  }

  var sourceCircle = undefined;
  var sourceRA = undefined;
  var sourceDec = undefined;
  var sourceFOV = undefined;

  var sourcePlotData = null;

  // Display the sources and create the data needed for the plots
  //
  function _showSources() {
    const ra0 = 15.0 * wwt.getRA(); // convert from hours
    const dec0 = wwt.getDec();
    const fov = wwt.get_fov();

    _hideSources();

    // Plot data
    const sigB = [];
    const sigW = [];
    const fluxB = [];
    const fluxW = [];

    const hrHM = [];
    const hrMS = [];

    const acisNum = [];
    const hrcNum = [];

    const r0 = [];
    const r1 = [];

    // Assume the FOV is the box size in degrees. Could
    // filter to fov / 2.0, but leave as fov just so that
    // if the user pans around a bit then the sources are
    // still shown. It also helps at the corners.
    //
    //
    const props = catalogProps.csc20;
    props.annotations = null;

    // Storage routine also has to fill in the plot data
    //
    const toStore = (row, pos) => {

      // could access the elements without creating an object
      // but I don't want to change existing code too much
      const src = getCSCObject(row);
      const shp = props.makeShape(props.color, props.size, src);
      const ann = makeAnnotation(row, pos, shp);
      ann.add();

      // plot data
      if (src.err_ellipse_r0 !== null &&
          src.err_ellipse_r1 !== null) {
        r0.push(src.err_ellipse_r0);
        r1.push(src.err_ellipse_r1);
      }

      // For hardness ratio, we want to remove undefined values
      // AND those that are pegged at +1 or -1, since the latter
      // dominate the data and makes the plot hard to see
      //
      if ((src.hard_hm !== null) &&
          (src.hard_ms !== null) &&
          (src.hard_hm > -0.999) && (src.hard_hm < 0.999) &&
          (src.hard_ms > -0.999) && (src.hard_ms < 0.999)) {
        hrHM.push(src.hard_hm);
        hrMS.push(src.hard_ms);
      }

      if ((src.acis_num !== null) && (src.acis_num > 0)) {
        acisNum.push(src.acis_num);
      }
      if ((src.hrc_num !== null) && (src.hrc_num > 0)) {
        hrcNum.push(src.hrc_num);
      }

      if (src.significance !== null) {
        if (src.fluxband === 'broad') {
          fluxB.push(src.flux);
          sigB.push(src.significance);
        } else if (src.fluxband === 'wide') {
          fluxW.push(src.flux);
          sigW.push(src.significance);
        }
      }
      return ann;
    };

    const selected = findNearestTo(ra0, dec0, fov,
				   catalogProps.csc20.data,
				   props.getPos, toStore);

    // can bail out now if there are no sources
    //
    if (selected.length === 0) { return; }

    // remove separation and store the results
    //
    props.annotations = selected.map(d => d[1]);

    // Combine the plot data
    //
    const out = {flux_b: null, flux_w: null, hr: null, poserr: null,
                 obscount: null};

    if (fluxB.length > 0) {
      out.flux_b = {sig: sigB, flux: fluxB};
    }

    if (fluxW.length > 0) {
      out.flux_w = {sig: sigW, flux: fluxW};
    }

    if (hrHM.length > 0) {
      out.hr = {hm: hrHM, ms: hrMS};
    }

    if (r0.length > 0) {
      const eccen = zip([r0, r1]).map((z) => {
        const a = z[0];
        const b = z[1];
        return Math.sqrt(1 - b * b * 1.0 / (a * a));
      });
      out.poserr = {r0: r0, r1: r1, eccentricity: eccen};
    }

    if ((acisNum.length > 0) || (hrcNum.length > 0)) {
      out.obscount = {acis: acisNum, hrc: hrcNum};
    }

    sourcePlotData = out;

    // Only draw on the circle if there are any sources
    //
    // Could cache the annotation and just move it, but
    // let's just create a new one each time for now.
    sourceCircle = wwt.createCircle(false);
    sourceCircle.setCenter(ra0, dec0);
    sourceCircle.set_skyRelative(true);
    sourceCircle.set_radius(fov);
    sourceCircle.set_lineColor('orange');

    wwt.addAnnotation(sourceCircle);

    sourceRA = ra0;
    sourceDec = dec0;
    sourceFOV = fov;

    return true;
  }

  // Note: this is used to set up the original data as well
  // as the now-removed update functionality. Should really
  // rename.
  //
  function updateCompletionInfo(status, stackdata) {

    let lmodStart = null;
    let lmodEnd = null;
    stackdata.stacks.forEach(stack => {
      stack.status = status.stacks[stack.stackid];
      /* if not completed then no element in the completed array */
      const completed = status.completed[stack.stackid]
      if (typeof completed !== 'undefined') {
        stack.lastmod = completed;
        if (lmodStart === null) {
          lmodStart = completed;
          lmodEnd = completed;
        } else if (completed < lmodStart) {
          lmodStart = completed;
        } else if (completed > lmodEnd) {
          lmodEnd = completed;
        }
      }
    });

    // The assumption is that these are both set
    stackdata.completed_start = lmodStart;
    stackdata.completed_end = lmodEnd;

    // Update the "Help" page (if still needed).
    const el = document.querySelector('#lastmod');
    if (el !== null) { el.innerHTML = status.lastupdate_db; }
  }

  function setTargetName(name) {
    if (typeof name === 'undefined') { name = ''; }
    name = name.trim();

    document.querySelector('#targetName').value = name;
    document.querySelector('#targetFind').disabled = (name === '');
  }

  /* As I am using the "official" names it seems that I do not
   * need to load a WTML file. Well, it didn't on my local
   * machine, but does when moving to the test production server.
   * Maybe some mystical caching going on based on user id/
   * browser sniffing? More likely it was that some names
   * I use are hard-coded/in the default name list, but
   * a few aren't.
   *
   * Should this only be called once?
   */
  function createImageCollections() {
    trace('adding image collection ...');
    wwt.loadImageCollection('csc2.wtml');
    trace('... added image collection');
  }

  // Tweaking the "definition" of the CHS format as we work out
  // what we want
  function makeCHS(chs) {

    const ann = wwt.createPolygon(false);

    // Change the color based on whether it is an "original" hull
    // (pink) or a changed one (cyan)
    //
    const color = chs.changed ? 'cyan' : 'pink';
    ann.set_lineWidth(2);
    ann.set_lineColor(color);
    ann.set_fillColor(color);
    ann.set_opacity(0.6);

    chs.coords.forEach(p => { ann.addPoint(p[0], p[1]); });

    // Add a circle so I can attach a label. Although this doesn't
    // seem to work.
    //
    const lbl = wwt.createCircle(true);
    lbl.setCenter(chs.ra, chs.dec);
    lbl.set_skyRelative(true);
    lbl.set_radius(60 / 3600.0);
    lbl.set_label(chs.label);
    lbl.set_opacity(0.5);
    lbl.set_id(chs.label); // do we need an ID to get click to work?
    lbl.set_showHoverLabel(true);

    return [ann, lbl];
  }

  // I want some feedback on the annotations, for the CHS work,
  // but not clear yet what the best thing to do is.
  //
  var annotationClickedFlag = false;
  var lastAnnotation = null;
  var lastAnnotationFillColor = null;

  function addAnnotationClicked() {
    if (annotationClickedFlag) { return; }

    wwt.add_annotationClicked((obj, eventArgs) => {
      const id = eventArgs.get_id();

      const pane = document.querySelector('#chs');
      pane.innerHTML = 'CHS: ' + id;
      pane.style.display = 'inline-block';

      if (lastAnnotation !== null) {
	lastAnnotation.set_fillColor(lastAnnotationFillColor);
      }

      // Find the selected annotation; it would be great if it were
      // sent to the handler...
      for (var i = 0; i < annotationsCHS.length; i++) {
	const ann = annotationsCHS[i][1];
	if (ann.get_id() !== id) { continue; }
	lastAnnotation = ann;
	lastAnnotationFillColor = ann.get_fillColor();
	ann.set_fillColor('red');
	break;
      }
    });
    annotationClickedFlag = true;
  }

  function removeAnnotationClicked() {
    if (!annotationClickedFlag) { return; }

    wwt.remove_annotationClicked();
    annotationClickedFlag = false;
  }

  var annotationsCHS = null;
  function createCHSAnnotations() {

    annotationsCHS = [];
    chsData.forEach(chs => {
      const ann = makeCHS(chs);
      if (ann !== null) {
        annotationsCHS.push(ann);
      }
    });

    const el = document.querySelector('#togglechs');
    el.innerHTML = 'Show CHS';
    el.disabled = false;

    // For the moment we can not change the display properties
    //
    // showBlockElement('sourcecolor');

    trace('Created CHS annotations');
  }

  // Change the settings to the values stored in the users state.
  // The assumption is that if the user has selected "don't store"
  // then there will be no key value in the state (other than for
  // the "do you want to save state" key).
  //
  // This should only be called after the event handlers for the
  // toggle options have been set up. As I extend this to include
  // items that require external data, that may be loaded asynchrounously,
  // or non-checkbox elements, it gets messier.
  //
  function createSettings() {
    toggleInfo.forEach(o => {
      const keyval = o.key === null ? null : getState(o.key);
      trace(` - setting for ${o.sel}  key=${o.key} -> ${keyval}`);
      if (keyval === null) { return; }

      const el = document.querySelector(o.sel);
      if (el === null) {
	console.log(`ERROR: unable to find toggle element ${o.sel}`);
	return;
      }

      let val = keyval;
      if (el.tagName === 'SELECT') {
	for (var idx = 0; idx < el.options.length; idx++) {
	  const opt = el.options[idx];
	  if (opt.value === val) {
	    opt.selected = true;
	  }
	}
      } else {
	val = keyval === 'true';
	if (val !== el.checked) {
	  el.checked = val;
	}
      }

      // Do we want to trigger a call to the event handler for this
      // option? I switched to "only call if there is no change", but
      // then it doesn't actually cause the value to be acted on. So
      // for now always trigger the call.
      //
      o.change(val);
    });

    wwt.hideUI(true);
    trace('Set settings');
  }

  // A user click can mean
  //   - do nothing
  //   - move to point
  //   - find the nearest stack / polygon
  //       processStackSelection
  //   - find the nearest source / circle
  //       processSourceSelection
  //   - start/add to/finish a polygon for selection
  //       processRegionSelection
  //       NOT fully implemented
  //
  var clickMode = processStackSelection;
  function handleUserClick(parent, pos) {
    if (clickMode === null) { return; }

    // It is not obvious to me how to determine "how" the user
    // initiated the click (e.g. was another key also pressed).
    //

    // Unlike the WWT position, this returns degrees (not hours)
    let ra = pos.get_RA();
    if (ra < 0) { ra += 360.0; }
    const dec = pos.get_dec();

    clickMode(ra, dec);
  }

  // Very experimental. Maybe even Extremely Experimental.
  //
  function switchSelectionMode(mode) {
    if (mode === 'stack') {
      clickMode = processStackSelection;
    } else if (mode === 'source') {
      clickMode = processSourceSelection
    } else if (mode === 'polygon') {
      clickMode = processRegionSelection;
      wwtprops.addPolygonPane();
    } else if (mode === 'point') {
      clickMode = processPointSelection;
    } else if (mode === 'nothing') {
      clickMode = null;
    } else {
      console.log(`Unknown selection mode: [${mode}]`);
    }
  }

  // Value from user; it's not clear whether we need this *and*
  // switchSelectionMode.
  //
  function setSelectionMode(mode) {
    // for now just pass to switchSelectionMode
    switchSelectionMode(mode);
  }

  // Move to ra,dec with the current zoom
  //
  function processPointSelection(ra, dec) {
    const fov = wwt.get_fov();
    wwt.gotoRaDecZoom(ra, dec, fov, false);
  }

  // Return the angular separation between the two points
  // Based on https://en.wikipedia.org/wiki/Great-circle_distance
  // and not really worrying about rounding errors (although this
  // has come back to bite me)
  //
  // Input arguments are in degrees, as is the
  // return value.
  //
  function separation(ra1, dec1, ra2, dec2) {
    const lat1 = dec1 * Math.PI / 180.0;
    const lat2 = dec2 * Math.PI / 180.0;
    const dlon = Math.abs(ra1 - ra2) * Math.PI / 180.0;

    const term = Math.sin(lat1) * Math.sin(lat2) +
          Math.cos(lat1) * Math.cos(lat2) * Math.cos(dlon);
    if (term >= 1.0) {
      return 0.0;
    } else if (term > -1.0) {
      return Math.acos(term) * 180.0 / Math.PI;
    } else {
      return 180.0;
    }
  }

  // Return a sorted list of objects within maxRadius (degrees)
  // of ra0, dec0 (decimal degrees), where xs is the list of
  // objects to sort, getPos is a function that, given an object,
  // returns the ra, dec to use, and toStore is a function that
  // converts the object to the stored value. So we have
  //
  //  RA -> Dec -> Radius ->
  //  [a] -> (a -> c) -> ((a, c) -> b) -> [[Radius, b]]
  //
  // where c is an object with ra and dec fields, and any other
  // fields that toStore needs (getPos is called once per item,
  // so can be used to increase a counter if required).
  //
  function findNearestTo(ra0, dec0, maxSep, xs, getPos, toStore) {
    const store = [];
    xs.forEach(a => {
      const pos = getPos(a);
      const sep = separation(ra0, dec0, pos.ra, pos.dec);
      if (sep <= maxSep) {
	store.push([sep, toStore(a, pos)]);
      }
    });

    // Sort the list by the separation
    store.sort(function (a, b) { if (a[0] < b[0]) { return -1; }
                                 else if (a[0] > b[0]) { return 1; }
                                 else { return 0; } });

    return store;
  }

  // For use when changing a stack annotation; returns an item
  // that can be used to restore the fov.
  //
  // selected indicates that this is the "selected" stack
  // rather than a "nearby" one.
  //
  function changeFov(fov, selected, lineColor, lineWidth) {
    const oldColor = fov.get_lineColor();
    const oldWidth = fov.get_lineWidth();

    const old = {fov: fov, selected: selected,
		 reset: () => {
		   fov.set_lineColor(oldColor);
		   fov.set_lineWidth(oldWidth);
		 }};

    fov.set_lineColor(lineColor);
    fov.set_lineWidth(lineWidth);
    return old;
  }

  // Show this stack using the "nearest stack" logic. The assumption is
  // that by using the stack location we will select this stack. The only
  // reason this wouldn't hold would be numerical errors, and the way the
  // stacks are created should mean this won't happen.
  //
  // TODO: shold be able to rewrite calling code to send in ra/dec
  //       and so call processStackSelection directly
  //
  function processStackSelectionByName(stackid) {
    const smatches = inputStackData.stacks.filter(d => d.stackid === stackid);
    if (smatches.length === 0) {
      console.log(`INTERNAL ERROR: unknown stackid=${stackid}`);
      return;
    }

    // Assume only one match
    const stack = smatches[0];
    processStackSelection(stack.pos[0], stack.pos[1]);
  }

  // Show the nearest stack: ra and dec are in degrees
  //
  function processStackSelection(sra0, sdec0) {

    clearNearestStack();

    // maximum separation to consider, in degrees.
    const maxSep = wwt.get_fov();

    const getPos = stack => { return {ra: stack.pos[0], dec: stack.pos[1]}; };
    const toStore = (stack, p) => stack;
    const seps = findNearestTo(sra0, sdec0, maxSep, inputStackData.stacks,
			       getPos, toStore);
    if (seps.length === 0) {
      return;
    }

    // Remove the closest item so we don't accidentally get confused later
    // on (when dealing with small separations/numerical issues).
    //
    const el0 = seps.shift();
    const stack0 = el0[1];

    const fovs = stackAnnotations[stack0.stackid];
    fovs.forEach(fov => nearestFovs.push(changeFov(fov, true, 'cyan', 4)));

    wwtprops.addStackInfo(stack0, stackEventVersions);

    if (seps.length === 0) { return; }

    if (!displayNearestStacks) { return; }

    // Apply a tolerance to identify if we have "close" stacks. This
    // is a heuristic. Note that we are actually interested in stacks
    // close to each other, so we repeart the nearest search but
    // this time use the location of the nearest stack.
    //
    // Pick a tolerance based on ACIS chip size as a start, and then
    // tweak. Ideally would know which FOVs overlapped, since this
    // could be used, but that seems a bit excessive.
    //
    const tol = 12 / 60.0;
    const nearest = findNearestTo(stack0.pos[0], stack0.pos[1], tol, seps,
				  d => { return {ra: d[1].pos[0], dec: d[1].pos[1]}; },
				  d => d[1]);

    // Update the closest ensembles by drawing them in a different color.
    //
    nearest.forEach(d => {
      const stack = d[1];
      stackAnnotations[stack.stackid].forEach(fov => {
	nearestFovs.push(changeFov(fov, false, 'cyan', 2));
      });
    });

    wwtprops.addNearestStackTable(stackAnnotations, stack0, nearest,
				  nearestFovs);
  }

  // Can we lasso a region?
  //
  // TODO:
  //   - at each new point, remove any points within the polygon
  //     (i.e. any point that leads to an intersecting polygon)
  //   - could we "delete" a point?
  //
  var regionPolygon = null;
  var regionMarker = null;
  var regionCoords = [];
  function processRegionSelection(ra0, dec0) {
    if (regionPolygon === null) {
      regionPolygon = wwt.createPolygon(true);
      regionPolygon.set_lineColor('white');
      regionPolygon.set_opacity(0.2);

      // This seems to work, even with no points
      wwt.addAnnotation(regionPolygon);

      regionCoords = [];
    }

    regionPolygon.addPoint(ra0, dec0);
    regionCoords.push([ra0, dec0]);

    // Add a marker indicating the start location; this could be
    // deleted after the user adds a second point, but let's see
    // how this works (as it also works to help the user see
    // where there next point will be connected to).
    //
    if (regionCoords.length === 1) {
      regionMarker = makeCircle(ra0, dec0, 5.0/3600, 1, 'white',
				'white', true, 1);
      wwt.addAnnotation(regionMarker);
    }

    // npts should be > 0 here
    const npts = regionCoords.length;
    const p = document.querySelector('#number-of-polygon-points');
    if (p !== null) {
      removeChildren(p);
      let cts = 'You have selected ';
      if (npts === 1) {
	cts += 'one point.';
      } else if (npts === 2) {
	cts += 'two points.';
      } else {
	cts += npts.toString() + ' points.';
      }
      p.appendChild(document.createTextNode(cts));
    }

    // Can we disable the "finished" button?
    if (npts > 2) {
      const btn = document.querySelector('#finished-polygon');
      if (btn !== null) {
	btn.disabled = false;
      }
    }
  }

  function clearRegionSelection() {
    regionCoords = [];
    if (regionPolygon !== null) {
      wwt.removeAnnotation(regionPolygon);
      regionPolygon = null;
    }

    if (regionMarker !== null) {
      wwt.removeAnnotation(regionMarker);
      regionMarker = null;
    }
  }

  // Highlight the selected source.
  //
  function selectSource(src) {
    const origLineColor = src.get_lineColor();
    const origFillColor = src.get_fillColor();
    const origOpacity = src.get_opacity();

    const current = {fov: src,
		     reset: () => {
		       src.set_lineColor(origLineColor);
		       src.set_fillColor(origFillColor);
		       src.set_opacity(origOpacity);
		     }
		    };
    nearestSource = [current];

    src.set_lineColor(selectedSourceColor);
    src.set_fillColor(selectedSourceColor);
    src.set_opacity(selectedSourceOpacity);
  }

  // ra and dec are in degrees
  //
  // This does not need to create sources, just find the nearest to
  // the click. This assumes that sources are shown.
  //
  function processSourceSelection(ra0, dec0) {

    const props = catalogProps.csc20;
    if ((props.annotations === null) || (props.annotations.length === 0)) {
      console.log('INTERNAL ERROR: processSouece selection called ' +
		  `with annotations=${props.annotations}`);
      return;
    }

    clearNearestSource();

    const maxSep = wwt.get_fov();

    // Find the annotations that are within maxSep of ra0, dec0.
    //
    const shown = findNearestTo(ra0, dec0, maxSep, props.annotations,
				d => d, (d, p) => d);
    if (shown.length === 0) {
      return 0;
    }

    // Identify the nearest source
    //
    const el0 = shown[0];
    const ann0 = el0[1];
    const src0 = ann0.data;

    // Let the user know what was selected.
    //
    selectSource(ann0.ann);
    wwtprops.addSourceInfo(getCSCObject(src0));

    if (!displayNearestSources) { return; }

    // Need to repeat the search since we now want the separations
    // relative to the selected source. We could loop over shown
    // - perhaps restricting to twice the cut off we use in
    //   creating neighbors, as a safety net - since this
    // has already been sorted? For now leave that as a future
    // optimisation.
    //
    const neighborsAll = findNearestTo(ann0.ra, ann0.dec, maxSep,
				       props.annotations,
				       d => d, (d, pos) => d);

    // Arbitrarily limit to the nearest n
    // Also note that we have to remove the first item since we
    // are looping over props.annotations and not shown[1...]
    //
    const neighbors = neighborsAll.slice(1, 11);

    const indexes = {
      name: getCSCColIdx('name'),
      significance: getCSCColIdx('significance'),
      variability: getCSCColIdx('var_flag'),
      fluxband: getCSCColIdx('fluxband'),
      flux: getCSCColIdx('flux'),
      nacis: getCSCColIdx('acis_num'),
      nhrc: getCSCColIdx('hrc_num'),
      nh: getCSCColIdx('nh_gal'),
    };

    wwtprops.addNearestSourceTable(indexes, neighbors);
  }

  // It is not clear if the handlers stack, or overwrite, when
  // multiple are set. For now assume they overwrite so we
  // can call this multiple times.
  //
  function setupUserSelection() {
    wwt.add_clicked(handleUserClick);
  }

  // Stop scroll in WWT from passing up to the browser,
  // or at least that was the hope.
  //
  var excessScroll = false;
  function stopExcessScrolling() {
    if (excessScroll) { return; }

    const host = getHost();
    if (host === null) {
      return;
    }

    const canvas = host.querySelector('#WWTCanvas');

    /*
     * This is from the ADS All-Sky Survey; not clear
     * what it's preventing so comment-out for now
     * (also, may not have converted from jQuery to DOM correctly)
     canvas.onscroll = function (e) {
     e.preventDefault();
     };
    */
    canvas.addEventListener('mousewheel', (e) => {
      e.preventDefault();
    }, false);
    canvas.addEventListener('DOMMouseScroll', (e) => {
      e.preventDefault();
    }, false);

    // Not sure what this is for, but ADS all-sky-survey do
    // it, so it must be good, right?
    canvas.onmouseout = (e) => {
      wwtlib.WWTControl.singleton.onMouseUp(e);
    };

    // Set up the drag handlers
    //
    host.addEventListener('dragover',
                          event => event.preventDefault(), false);
    host.addEventListener('drop', draggable.stopDrag, false);

    const panes = ['#preselected', '#settings', '#plot'
		   // , '#neareststackinfo', '#nearestsourceinfo'
		   // for now not draggable
		   // as need to sort out window size properly
		  ];
    panes.forEach((n) => {
      const pane = host.querySelector(n);
      if (pane !== null) {
        pane.draggable = true;
        pane.addEventListener('dragstart', draggable.startDrag, false);
      } else {
        console.log(`INTERNAL error: unable to find "${n}"`);
      }
    });

    // Indicate we have already been called.
    excessScroll = true;

  }

  // Convert a value to a floating-point number, returning null
  // if there was a problem. It is not guaranteed to catch all
  // problems (since it uses parseFloat rather than Number).
  //
  function toNumber(inval) {
    const outval = parseFloat(inval);
    if (isNaN(outval)) { return null; }
    return outval;
  }

  // This will go to (in order of preference)
  //   location specified in URL
  //   user's last-selected position
  //   a default value given by ra0, dec0.
  //
  function resetLocation() {
    // Clear out the target name field, as can see it remain on
    // a page reload (possibly a Mozilla persistence thing).
    // Do this even if going to a named location from a previous
    // visit, as I think this is too much effort to track
    // reliably.
    setTargetName('');

    if (userLocation !== null) {
      // assume userLocation has been validated
      wwt.gotoRaDecZoom(userLocation.ra,
			userLocation.dec,
			userLocation.zoom, false);
      trace('Set up zoom to user-supplied location');
      return;
    }

    // Try to guard against accidentally-stupid values
    //
    const loc = getState(keyLocation);
    let ra = null;
    let dec = null;
    if (loc !== null) {
      const toks = loc.split(',');
      if (toks.length === 2) {
	ra = toNumber(toks[0]);
	dec = toNumber(toks[1]);
	if ((ra < 0) || (ra >= 360)) { ra = null; }
	if ((dec < -90) || (dec > 90)) { dec = null; }
      }
    }

    let zoom = getState(keyFOV);
    if (zoom !== null) { zoom = toNumber(zoom); }
    if (zoom === null) {
      zoom = startFOV;
    } else {
      if (zoom < minFOV) { zoom = minFOV; }
      else if (zoom > maxFOV) { zoom = maxFOV; }
      trace(`Setting zoom to: ${zoom}`);
    }

    if ((ra === null) || (dec === null)) {
      wwt.gotoRaDecZoom(ra0, dec0, zoom, false);
      trace('Set up zoom to starting location: default');
    } else {
      wwt.gotoRaDecZoom(ra, dec, zoom, false);
      trace('Set up zoom to starting location: stored');
    }

  }

  // Set up the onclick handler for the given "pane". A simple scheme
  // is used to ensure that a handler is only added once.
  //
  const seenShowHide = [];

  function setupShowHide(sel) {
    if (seenShowHide.includes(sel)) {
      trace(` - already added show/hide for ${sel}`);
      return;
    }

    const pane = document.querySelector(sel);
    if (pane === null) {
      console.log(`INTERNAL ERROR (show/hide): unable to find ${sel}`);
      return;
    }

    const find = lbl => {
      const el = pane.querySelector(lbl);
      if (el === null) {
	console.log(`INTERNAL ERROR (show/hide): no ${lbl} in ${sel}`);
      }
      return el;
    };

    // Assume we can take the first one, since we have not given the
    // element an id.
    //
    // Assume that the resize images are in hide/show order.
    //
    const control = find('div.controlElements');
    const main = find('div.main');
    const span = find('span.switchable');
    const imgs = span.querySelectorAll('img');
    if ((control === null) || (main === null) || (span === null) ||
        (imgs.length !== 2)) {
      return;
    }

    // We add hideable/showable classes to the span to indicate
    // what the state is (rather than keep knowledge of the state
    // in a javascript variable).
    //
    span.addEventListener('click', () => {
      if (span.classList.contains('hideable')) {
	main.style.display = 'none';
	span.classList.remove('hideable');
	span.classList.add('showable');
	control.classList.remove('controlElementsShown');

	imgs[0].style.display = 'none';
	imgs[1].style.display = 'block';
      } else {
	main.style.display = 'block';
	span.classList.remove('showable');
	span.classList.add('hideable');
	control.classList.add('controlElementsShown');

	imgs[1].style.display = 'none';
	imgs[0].style.display = 'block';
      }
    }, false);
  }

  // This used to be sent in data, hence the function returning a function,
  // but that should no-longer be needed.
  //
  function wwtReadyFunc() {
    trace('in wwtReadyFunc (with restart)');
    return function () {

      createImageCollections();
      createSettings();
      addMW();
      addFOV(inputStackData);

      setupUserSelection();
      stopExcessScrolling();

      // Not 100% happy with the UI for indicating data to be
      // sent via Web-SAMP, but leave in for now.
      //
      loadStackEventVersions();
      downloadEnsData();

      // TODO: should this only be changed once the ready function has
      //       finished?
      //
      // Use the image choice from the display query parameter or, if
      // not set, the saved setting.
      //
      const selImg = userDisplay === null ? getState(keyForeground) : userDisplay;
      if (selImg !== null) {
	const sel = document.querySelector('#imagechoice');

	// Is there a neater way to do this? It is also not ideal
	// for the case when selImg is not valid: what happens to
	// the display?
	//
	let found = false;
	for (var idx = 0; idx < sel.options.length; idx++) {
	  const opt = sel.options[idx];
	  if (opt.value === selImg) { opt.selected = true; found = true; break; }
	}

	if (found) {
	  trace(`Trying to change the display to ${selImg}`);
	  // Assume this is supported in recent browsers; see
	  // https://stackoverflow.com/questions/19329978/change-selects-option-and-trigger-events-with-javascript/28296580
	  //
	  try {
	    sel.dispatchEvent(new CustomEvent('change'));
	  }
	  catch (e) {
	    // Try this
	    trace(` - change event failed with ${e}`);
            setImage(selImg);
	  }
	}
      }

      resetLocation();
      removeSetupBanner();

      wwtsamp.setup(reportUpdateMessage, trace);

      // setupShowHide('#preselected'); // width changes if show/hide
      setupShowHide('#settings');
      setupShowHide('#plot');

      // Display the control panel
      //
      const panel = document.querySelector('#wwtusercontrol');
      if (panel === null) {
        console.log('Internal error: unable to find #wwtusercontrol!');
      } else {
        panel.style.display = 'block';
      }

      // Poll for the WWT display
      //
      setWWTStatePoll();

      // So, can find out when zoom events finished, but do not need
      // this at the moment (did this not used to work, or did I
      // mis-understand its intent?)
      //
      /***
      wwt.add_arrived((obj, eventArgs) => {
	console.log("*** We have arrived...");
	console.log("    ra = " + eventArgs.get_RA());
	console.log("       = " + 15.0 * wwt.getRA());
	console.log("   dec = " + eventArgs.get_dec());
	console.log("       = " + wwt.getDec());
	console.log("  zoom = " + wwt.get_fov()); // eventArg?
      });
      ***/

      trace('Finished wwtReadyFunc');
    };
  }

  function decode(s) {
    const a = parseInt(s.slice(0, 2));
    const b = parseInt(s.slice(2, 4));
    const c = parseInt(s.slice(4));
    return [a, b, c];
  }

  // TODO: review why this information can not be just sent in (or
  //       accessed from the data we already have).
  //
  function decodeStackName(stackid) {
    // Expect the stackid to be 23 or 24 characters long,
    // with the coordinates in (6,20) or (5,19)
    var coords;
    if (stackid.length === 24) {
      coords = stackid.slice(6, 20);
    } else if (stackid.length === 23) {
      coords = stackid.slice(5, 19);
    } else {
      // just return an invalid position
      console.log(`Error: invalid stackid=${stackid}`);
      return [-100, -100];
    }

    const ras = decode(coords.slice(0, 7));
    const decs = decode(coords.slice(8));

    // the third ra coponent is multiplied by 10 to avoid
    // a decimal point, so need to correct that here
    const ra = 15.0 * (ras[0] + (ras[1] + (ras[2] / 600.0)) / 60.0);
    let dec = decs[0] + (decs[1] + (decs[2] / 60.0)) / 60.0;
    if (coords[7] === 'm') { dec *= -1; }
    return [ra, dec];
  }

  function clearNearestStack() {
    nearestFovs.forEach(fov => fov.reset());
    nearestFovs = [];
    wwtprops.clearStackInfo();
    wwtprops.clearNearestStackTable();
  }

  function clearNearestSource() {
    if (nearestSource.length < 1) { return; }
    nearestSource.forEach(src => src.reset());
    nearestSource = [];
    wwtprops.clearSourceInfo();
    wwtprops.clearNearestSourceTable();
  }

  function findNearestStack() {

    // getRA returns hours, not degrees, it seems.
    const ra0 = 15.0 * wwt.getRA();
    const dec0 = wwt.getDec();

    processStackSelection(ra0, dec0);
  }

  var traceCounter = 1;
  function trace(msg) {
    console.log(`TRACE[${traceCounter}] ${msg}`);
    traceCounter += 1;
  }

  // Let users know WWT/data is being set up.
  //
  // This is only needed because occasionally the page setup fails
  // and it's not obvious what has happened. This currently leverages
  // the existing notification system; should it have a separate
  // version to reduce the chance of conflicts?
  //
  // Tweaking this to try re-initializing after the *first* attempt,
  // as it will hopefully work then. Let's see how it is going to work.
  //
  var setupBannerID;
  function addSetupBanner() {
    var pane = document.querySelector('#stackUpdateStatus');
    pane.innerHTML = 'Creating the WWT visualization.';
    pane.style.display = 'inline-block';

    // There probably needs to be an additional timeout on the call to
    // wwtReadyFunc.
    //
    setupBannerID = setTimeout(() => {
      pane.innerHTML = 'There was a problem initializing the WWT.' +
        '<br>Trying to restart.';
      pane.style.color = 'darkblue';
      wwtReadyFunc()(); // NOTE: the use of '()()' is intentional.
    }, 10 * 1000);

  }

  // Remove the setup banner.
  function removeSetupBanner() {
    clearTimeout(setupBannerID);
    setupBannerID = null;

    const pane = document.querySelector('#stackUpdateStatus');
    pane.innerHTML = '';
    pane.style.display = 'none';
  }

  // handle the tooltip display for the button
  //
  // The aim is to display the tooltip a short time after
  // entry, and then time out. Try to kill the timers if
  // they are no-longer valid.
  //
  var tooltipTimers = {};

  function clearToolTipTimer(name) {
    if (tooltipTimers[name] === null) { return; }
    clearTimeout(tooltipTimers[name]);
    tooltipTimers[name] = null;
  }

  // time out is in seconds, default is 3
  function addToolTipHandler(name, timeout) {
    if (name in tooltipTimers) {
      console.log(`WARNING: multiple calls to addToolTipHandler ${name}`);
      return;
    }

    if (typeof timeout === 'undefined') { timeout = 3; }

    // what does a time out of 0 do?
    if (timeout <= 0) { timeout = 0; }

    const el = document.querySelector('#' + name);
    if (el === null) {
      console.log(`Internal error [tooltip]: no element called "${name}"`);
      return;
    }

    const tooltip = name + '-tooltip';
    const tt = document.querySelector('#' + tooltip);
    if (tt === null) {
      console.log(`Internal error [tooltip]: no element called "${tooltip}"`);
      return;
    }

    tooltipTimers[name] = null;

    el.addEventListener('mouseenter', () => {
      clearToolTipTimer(name);
      const timer = setTimeout(() => {
        tt.style.display = 'inline';
        const timer2 = setTimeout(() => {
          tt.style.display = 'none';
        }, timeout * 1000);
        tooltipTimers[name] = timer2;
      }, 500);
      tooltipTimers[name] = timer;

    }, false);
    el.addEventListener('mouseleave', () => {
      clearToolTipTimer(name);
      tt.style.display = 'none';
    }, false);

    trace(`set up tooltips for ${name}`);
  }

  function removeToolTipHandler(name, repflag) {
    if (typeof repflag === 'undefined') { repflag = true; }
    if (repflag && !(name in tooltipTimers)) {
      console.log(`WARNING: removeToolTipHandler sent unknown ${name}`);
      return;
    }
    clearToolTipTimer(name);
    delete tooltipTimers[name];
  }

  /*
   * Set up the help section: create the "panes" for the stack
   * and source info examples. This relies on "fake" data
   * structures (we could use inputStackData but would need to do
   * this after the status field has been added or hack that), but
   * this is not possible with the source info with the current
   * architecture, since it will not have been read in. So use
   * hand-built versions.
   */
  const stackExample =
    { stackid: 'acisfJ0618409m705956_001',
      nobs: 4,
      pos: decodeStackName('acisfJ0618409m705956_001'),
      description: 'The stack contains 4 ACIS observations',
      status: true};

  // '2CXO J061859.6-705831'
  const sourceExample =
    ["2CXO J061859.6-705831",
     94.74868,
     -70.97541,
     0.93,
     0.61,
     25.5,
     "FALSE",
     "FALSE",
     3,
     0,
     "FALSE",
     2.78,
     "broad",
     8.111e-16,
     4.442e-16,
     1.159e-15,
     8.76,
     -0.2561,
     -0.634,
     0.1418,
     -0.1549,
     -0.4716,
     0.203];

  // Returns the handler function used to hide or show the
  // resizeusercontrol area.
  //

  function resizeUserControl(host) {
    var resizeState = true;

    return () => {
      const user = host.querySelector('#wwtusercontrol');
      const panel = user.querySelector('div.usercontrolpanel');

      const smallify = panel.querySelector('#smallify');
      const bigify = panel.querySelector('#bigify');

      var state, ustate;
      if (resizeState) {
        smallify.style.display = 'none';
        bigify.style.display = 'block';
        state = 'none';
	ustate = 'none';
      } else {
        smallify.style.display = 'block';
        bigify.style.display = 'none';
        state = 'block';
	ustate = 'flex';
      }

      // Do we hide or display the main content?
      user.querySelector('#wwtuserbuttons').style.display = ustate;

      // What about the other control icons: I had originally kept
      // them displayed, but I now want to hide them if the main
      // content is hidden.
      //
      const sel = 'div.with-tooltip , div.with-tooltip-static';
      panel.querySelectorAll(sel).forEach(div => {
	div.style.display = state;
      });

      resizeState = !resizeState;
    };
  }

  // Tweak settings based on development mode.
  //
  function tweakDisplaySettings() {
    if (displayCHS) {
      setDisplay('chsbar', 'inline');
    }

    if (displayCSC11) {
      setDisplay('source11bar', 'flex');
    }

    // Unlike the others, the default is to show this
    if (!displayPolygonSelect) {
      const el = document.querySelector('option[value=polygon]');
      if (el !== null) { el.style.display = 'none'; }
    }
  }

  // Has the user asked for certain behavior? I don't believe this
  // will work on IE, but in this case we just don't try to support
  // the optional triggers.
  //
  function toggleOptionalBehavior() {
    let params = null;
    try {
      params = (new URL(document.location)).searchParams;
    } catch (e) {
      console.log(`ERROR: unable to retrieve searchParams: ${e}`);
      return;
    }

    trace('Setting optional behavior');
    displayPolygonSelect = params.has('polygon');
    displayCSC11 = params.has('csc11');
    displayCHS = params.has('chs');
    displayNearestStacks = params.has('stack');
    displayNearestSources = params.has('source');

    trace(` -> polygon=${displayPolygonSelect} csc11=${displayCSC11} chs=${displayCHS} nearest-stacks=${displayNearestStacks} nearest-sources=${displayNearestSources}`);

    // zoom is only used if ra and dec are given, but is optional
    if (params.has('ra') && params.has('dec')) {
      const raStr = params.get('ra');
      const decStr = params.get('dec');
      const zoomStr = params.has('zoom') ? params.get('zoom') : '1.0';

      const ra = Number(raStr);
      const dec = Number(decStr);
      const zoom = Number(zoomStr);

      if (isNaN(ra) || isNaN(dec) || isNaN(zoom)) {
	console.log(`Unable to convert ra=${raStr} dec=${decStr} zoom=${zoomStr} to a location`);
	return;
      }

      if ((ra < 0) || (ra >= 360)) {
	console.log(`Invalid ra=${raStr} for location`);
	return;
      }

      if ((dec < -90) || (dec > 90)) {
	console.log(`Invalid dec=${decStr} for location`);
	return;
      }

      // Should we cap the zoom rather than throw out invalid values?
      if ((zoom <= 0) || (zoom > 60)) {
	console.log(`Invalid zoom=${zoomStr} for location`);
	return;
      }

      userLocation = {ra: ra, dec: dec, zoom: zoom};
      trace(` -> userLocation: ra=${userLocation.ra} dec=${userLocation.dec} zoom=${userLocation.zoom}`);
    }

    // Match against the values in the select widget, to ensure it
    // is a valid setting.
    //
    const sel = document.querySelector('#imagechoice');
    const display = params.get('display');
    if ((sel !== null) && (display !== null)) {
      let found = false;
      for (var idx = 0; !found && (idx < sel.options.length); idx++) {
	found |= (sel.options[idx].value === display);
      }
      if (found) {
	userDisplay = display;
	trace(` -> userDisplay: ${userDisplay}`);
      }
    }
  }

  // Note that the WWT "control" panel will not be displayed until
  // WWT is initalized, even though various elements of the panel are
  // set up in initialize.
  //
  function initialize(obsdata) {

    const host = getHost();
    if (host === null) {
      return;
    }

    trace('initialize');

    toggleOptionalBehavior();

    // In case the local-storage schema ever needs to be updated.
    updateSchema();

    // At present this just changes the box size/height
    resize();

    /* should have the stack "location" in the input file,
       but for now re-create it */
    for (let stack of obsdata.stacks) {
      stack.pos = decodeStackName(stack.stackid);
    }

    trace('recoded positions');

    inputStackData = obsdata;

    // Add in the example stack and source panes to the help page
    wwtprops.addStackInfoHelp(stackExample);
    wwtprops.addSourceInfoHelp(getCSCObject(sourceExample));

    // TODO: should this check that the name is not blank/empty?
    const tfind = host.querySelector('#targetFind');
    tfind.addEventListener('click', () => { findTargetName(); }, false);

    /* Allow the user to start the search by hitting enter in the
     * search text box. The search button is only active when
     * there is text.
     */
    const tname = host.querySelector('#targetName');
    tname.addEventListener('keyup',
			   (e) => {
                             const val = tname.value.trim();

                             // Ensure the submit button is only enabled when
			     // there is any text.
                             if (val === '') { tfind.disabled = true; return; }
                             else if (tfind.disabled) { tfind.disabled = false; };

                             if (e.keyCode !== 13) { return; }
                             tfind.click();
                           }, false);

    // resize the user-control area
    host.querySelector('#resizeusercontrol')
      .addEventListener('click', resizeUserControl(host), false);

    // Zoom buttons
    // - QUS: what should the "zoom in as much you can" go to
    //        a source or a stack?
    //
    host.querySelector('#zoom0')
      .addEventListener('click', () => { zoom(60); }, false);
    host.querySelector('#zoomn')
      .addEventListener('click', () => { zoom(0.2); }, false);  // 0.6 is okay too
    host.querySelector('#zoomin')
      .addEventListener('click', () => { zoomIn(); }, false);
    host.querySelector('#zoomout')
      .addEventListener('click', () => { zoomOut(); }, false);

    // Copy to clipboard button(s)
    //
    host.querySelector('#coordinate-clip')
      .addEventListener('click', (event) => { clipCoordinates(event); }, false);
    host.querySelector('#bookmark')
      .addEventListener('click', (event) => { clipBookmark(event); }, false);

    // SAMP button
    //
    host.querySelector('#export-samp')
      .addEventListener('click', () => {
        wwtsamp.sendSourcePropertiesNear(sourceRA, sourceDec, sourceFOV);
      }, false);

    host.querySelector('#plot-properties')
      .addEventListener('click', () => {
	wwtplots.plotSources(sourcePlotData);
      }, false);

    addToolTipHandler('zoom0');
    addToolTipHandler('zoomn');
    addToolTipHandler('zoomin');
    addToolTipHandler('zoomout');
    addToolTipHandler('export-samp');
    addToolTipHandler('plot-properties');

    addToolTipHandler('smallify');
    addToolTipHandler('bigify');

    addToolTipHandler('coordinate-clip');
    addToolTipHandler('bookmark');

    addToolTipHandler('register-samp');

    addToolTipHandler('targetName', 20);
    addToolTipHandler('targetFind');

    tweakDisplaySettings();

    // Do we show the 'show fullscreen' button?
    //
    if (wwtscreen.hasFullScreen()) {
      trace('found full screen support');
      const container = host.querySelector('#fullscreenoption');
      if (container === null) {
	consle.log('ERROR: no #fullscreenoption found');
      } else {
	container.style.display = 'block';
      }
      /*
      el.addEventListener('click', () => wwtscreen.toggleFullScreen(), false);
      */
    } else {
      trace('no full screen support :-(');
    }

    // Event handler for the reset button.
    //
    const reset = host.querySelector('#resetdefaults');
    if (reset === null) {
      console.log('ERROR: unable to find #resetdefaults');
    } else {
      reset.addEventListener('click', () => { resetSettings(); }, false);
    }

    // Settings support (experimental)
    //
    toggleInfo.forEach(o => {
      const el = host.querySelector(o.sel);
      if (el === null) {
	console.log(`ERROR: unable to find toggle element ${o.sel}`);
	return;
      }
      if (el.tagName === 'SELECT') {
	trace(` - adding change handler for settings: ${o.sel}`);
	el.addEventListener('change',
			    ev => { o.change(ev.target.value); },
			    false);
      } else {
	trace(` - adding click handler for settings: ${o.sel}`);
	el.addEventListener('click',
			    ev => { o.change(ev.target.checked); },
			    false);
      }
    });

    // Start up the WWT initialization and then load in
    // the current status.
    //
    trace('initializing wwtlib...');
    wwt = wwtlib.WWTControl.initControl('WWTCanvas');
    trace('...initialized wwtlib');

    addSetupBanner();

    var req = new XMLHttpRequest();
    if (!req) {
      alert('Unable to create a XMLHttpRequest!');
      return;
    }
    req.addEventListener('load', () => {
      trace(' - in load listener');
      const status = req.response;
      updateCompletionInfo(status, obsdata);
      trace(' - updatedCompletionInfo');
      wwt.add_ready(wwtReadyFunc());
      trace(' - finished add_ready');
    }, false);
    req.addEventListener('error', () => {
      alert('Unable to download the status of the CSC!');
    }, false);

    // Do I need to add a cache-busting identifier?
    req.open('GET', 'wwtdata/wwt_status.json' + cacheBuster());
    req.responseType = 'json';
    req.send();
  }

  function unload() {
    wwtsamp.teardown();
  }

  // Page has resized; what do we need to update?
  //
  // This currently makes the page a little too large; not sure why
  //
  // Note: this function gets called if the user presses Escape when
  //       full-screen mode is called. We add some logic to try and
  //       identify this (but note that resize is called on entering
  //       full screen mode as well as exiting it).
  //
  function resize() {
    const host = getHost();
    if (host === null) {
      return;
    }

    const div = host.querySelector('#WWTCanvas');

    /*
     * I want to leave some space to allow the page to be
     * scrolled, rather than fill the full width. Use a
     * guess of 60 pixels as a buffer.
     *
     * actually - remove this as trying for a full-page look.
     */
    const width = window.innerWidth;
    const height = window.innerHeight;

    // See if this gives more accurate values, from
    // https://ryanve.com/lab/dimensions/
    //
    // var width = document.documentElement.clientWidth;
    // var height = document.documentElement.clientHeight;

    // if (width > 160) { width -= 60; }

    var wstr = width.toString() + 'px';
    if (div.style.width !== wstr) {
      div.style.width = wstr;
      host.style.width = wstr;
    }

    var hstr = height.toString() + 'px';
    if (div.style.height !== hstr) {
      div.style.height = hstr;
      host.style.height = hstr;
    }

    // Try to work out if the user has exited full-screen mode
    //
    const el = host.querySelector('#togglefullscreen');
    if (wwtscreen.isFullScreen()) {
      if (wwtscreen.isEnteringFullScreen()) {
        wwtscreen.clearEnteringFullScreen();
      } else {
	el.checked = false;
        wwtscreen.clearFullScreen();
      }
    } else {
      if (el.checked) { el.checked = false; }
    }

  }

  function setPosition(ra, dec, label, fov) {

    // Could request the current FOV, but I think it makes
    // sense to switch back to a "sensible" zoom level when
    // changing location.
    // var fov = startFOV;
    fov = fov || 5.0;

    // clean out the status field; this is not ideal, since when
    // using the set-position-via-name-lookup we want the text
    // to be set, but I don't want to change things significantly
    // at the moment.
    //
    hideElement('targetSuccess');
    hideElement('targetFailure');

    // Ensure the search button is not disabled, even though
    // pressing it isn't going to change the position by much
    // (I don't guarantee that the location I have used matches
    // that returned by LookUp, and it is no-longer guaranteed that
    // this routine is only called from processing a LookUp request).
    //
    setTargetName(label);

    hideSources();
    clearNearestStack();

    wwt.gotoRaDecZoom(ra, dec, fov, false);
    wwtsamp.moveTo(ra, dec);

    // Can not just call showSources here since we have not
    // necessarily reached the desired location. I have had no
    // success in adding a trigger for this condition - e.g.
    // using the wwtArrived function from
    // http://bl.ocks.org/philrosenfield/55082c9e9ff26a77444617be1353d6c5
    //
  }

  // Is this a positive (including 0) float?
  // No exponential notation supported here.
  //
  const posFloatRegex = /^(\+)?([0-9]+)?(\.[0-9]+)?$/;
  function posFloat(s) {
    return posFloatRegex.test(s);
  }

  // How about supporting negative numbers
  const anyFloatRegex = /^(\-|\+)?([0-9]+)?(\.[0-9]+)?$/;
  function anyFloat(s) {
    return anyFloatRegex.test(s);
  }

  // Convert a number to a RA (in decimal degrees). Supported input
  // are:
  //    decimal degrees
  //    hours(int) [ :h] minutes(float) [:m]
  //    hours(int) [ :h] minutes(float) [:m] seconds(float) [:s]
  // where white space is allowed between the tokens
  //
  // There is no requirement that the labels match - e.g. at present
  //   23h 45:23
  //   23h 45.23
  //   23 45:23
  // are all supported.
  //
  // No guarantee on error checking, or nice, clean code.
  //
  const hourRegex = /^(\d\d?)\s*[:hH]?\s*(.*)$/;
  const minRegex = /^(\d\d?(\.[\d]*)?)\s*[:mM]?\s*(.*)$/;
  const secRegex = /^(\d\d?(\.[\d]*)?)\s*[sS]$/;

  function strToRA(str) {
    let sval = str.trim();

    if (posFloat(sval)) {
      const ra = parseFloat(sval);
      if ((ra < 0) | (ra > 360.0)) {
        return null;
      }
      return ra;
    }

    // Separators can be ' ', ':', 'h', 'm', 's' although
    // some of these are positional (h/m/s)
    //
    const hr = hourRegex.exec(sval);
    if (hr === null) {
      return null;
    }

    // Could use parseInt here
    const h = parseFloat(hr[1]);
    if ((h < 0.0) || (h > 24.0)) {
      return null;
    }

    // now look for minutes
    sval = hr[2];

    if (sval.trim() === '') {
      return 15.0 * h;
    }

    let m;
    if (posFloat(sval)) {
      m = parseFloat(sval);
      if ((m < 0.0) || (m > 60.0)) {
        return null;
      }
      return 15.0 * (h + (m / 60.0));
    }

    const mr = minRegex.exec(sval);
    if (mr === null) {
      return null;
    }

    m = parseFloat(mr[1]);
    if ((m < 0.0) || (m > 60.0)) {
      return null;
    }

    // now look for seconds
    sval = mr[3];

    if (sval.trim() === '') {
      return 15.0 * (h + (m / 60.0));
    }

    let s;
    if (posFloat(sval)) {
      s = parseFloat(sval);
      if ((s < 0.0) || (s > 60.0)) {
        return null;
      }
      return 15.0 * (h + (m + (s / 60.0)) / 60.0);
    }

    const sr = secRegex.exec(sval);
    if (sr === null) {
      return null;
    }

    s = parseFloat(sr[1]);
    if ((s < 0.0) || (s > 60.0)) {
      return null;
    }

    return 15.0 * (h + (m + (s / 60.0)) / 60.0);
  }

  // Convert a number to a Dec (in decimal degrees). Supported input
  // are:
  //    decimal degrees
  //    (+-)degrees(int) [ :d] minutes(float) [:m']
  //    (+-)degrees(int) [ :d] minutes(float) [:m'] arcseconds(float) [:s"]
  // where white space is allowed between the tokens
  //
  // There is no requirement that the labels match - e.g. at present
  //   23d 45:23
  //   23d 45.23
  //   23 45:23
  // are all supported.
  //
  // No guarantee on error checking.
  //
  const degRegex = /^(\d\d?)\s*[:dD]?\s*(.*)$/;
  const dminRegex = /^(\d\d?(\.[\d]*)?)\s*[:mM']?\s*(.*)$/;
  const dsecRegex = /^(\d\d?(\.[\d]*)?)\s*[sS"]$/;

  function strToDec(str) {
    var sval = str.trim();

    if (anyFloat(sval)) {
      var dec = parseFloat(sval);
      if ((dec < -90) || (dec > 90.0)) {
        return null;
      }
      return dec;
    }

    var sign = 1.0;
    if (sval.startsWith('-')) {
      sign = -1.0;
      sval = sval.slice(1).trim();
    } else if (sval.startsWith('+')) {
      sval = sval.slice(1).trim();
    }

    // Separators can be ' ', ':', 'd', 'm', 's', ' and "" although
    // some of these are positional (e.g. d/m/s)
    //
    const dr = degRegex.exec(sval);
    if (dr === null) {
      return null;
    }

    // Note that for a negative value to appear
    // here there must be something like '--' or '+-', which is
    // invalid, hence the positive check
    const d = parseFloat(dr[1]);
    if ((d < 0.0) || (d > 90.0)) {
      return null;
    }

    // now look for minutes
    sval = dr[2];

    if (sval.trim() === '') {
      return sign * d;
    }

    if (posFloat(sval)) {
      var m = parseFloat(sval);
      if ((m < 0.0) || (m > 60.0)) {
        return null;
      }
      return sign * (d + (m / 60.0));
    }

    const mr = dminRegex.exec(sval);
    if (mr === null) {
      return null;
    }

    m = parseFloat(mr[1]);
    if ((m < 0.0) || (m > 60.0)) {
      return null;
    }

    // now look for seconds
    sval = mr[3];

    if (sval.trim() === '') {
      return sign * (d + (m / 60.0));
    }

    if (posFloat(sval)) {
      var s = parseFloat(sval);
      if ((s < 0.0) || (s > 60.0)) {
        return null;
      }
      return sign * (d + (m + (s / 60.0)) / 60.0);
    }

    const sr = dsecRegex.exec(sval);
    if (sr === null) {
      return null;
    }

    s = parseFloat(sr[1]);
    if ((s < 0.0) || (s > 60.0)) {
      return null;
    }

    return sign * (d + (m + (s / 60.0)) / 60.0);
  }

  // For use by the name-lookup functionality.
  //
  // Success messages time out after a brief period, whereas failure
  // messages remain and require the user to close the pane.
  //
  // Actually, there is a case when we want the "success" message to
  // not time out, which is when the search is running.
  //
  // Safari version 9 (macOS 10.9 I think) doesn't seem to support
  // default parameter values, so do not use for now.
  //
  // function reportLookupSuccess(msg, close=true) {
  function reportLookupSuccess(msg, close) {

    if (typeof close === 'undefined') { close = true; }

    hideElement('targetFailure');

    const pane = document.querySelector('#targetSuccess');
    removeChildren(pane);

    pane.innerHTML = msg;
    pane.style.display = 'inline-block';

    if (close) {
      const cb = () => { pane.style.display = 'none' };
      setTimeout(cb, 4000);
    }

    // TODO: show / hide the close-pane button depending on close
    //       setting

  }

  // Where else do I have this coded up?
  //
  function addCloseButton(callback) {
    const span = document.createElement('span');
    span.setAttribute('class', 'closable');
    span.addEventListener('click', callback, false);

    const img = document.createElement('img');
    img.setAttribute('class', 'icon');
    img.setAttribute('alt', 'Close icon (circle with a times symbol in it)');
    img.setAttribute('src', 'wwtimg/fa/times-circle.svg');
    span.appendChild(img);

    return span;
  }
  
  function reportLookupFailure(msg) {
    hideElement('targetSuccess');

    const pane = document.querySelector('#targetFailure');
    if (pane === null) {
      // Assume it's not worth trying to recover
      return;
    }

    removeChildren(pane);

    pane.appendChild(addCloseButton(() => {
      hideElement('targetFailure');
      setTargetName('');
    }));

    const div = document.createElement('div');
    div.innerHTML = msg;
    pane.appendChild(div);
    pane.style.display = 'inline-block';
  }

  // Add the spinner. If it's already displayed increase the
  // counter. Each startSpinner call must be matched by a stopSpinner
  // call. There is limited support to try and recover from
  // a failure to maintain this.
  //
  var spinnerCounter = 0;
  var spin = null;

  function startSpinner() {
    const host = getHost();
    if (host === null) {
      return;
    }

    if (spinnerCounter < 0) {
      console.log('Internal error: spinner counter < 0');
      spinnerCounter = 0;
    }
    spinnerCounter += 1;
    trace(`Spinner count increased to ${spinnerCounter}`);

    if (spinnerCounter > 1) {
      return;
    }

    spin = spinner.createSpinner();
    host.appendChild(spin);
    trace(' -> added spinner');
  }

  function stopSpinner() {
    const host = getHost();
    if (host === null) {
      return;
    }

    if (spinnerCounter <= 0) {
      console.log('Internal error: spinner counter <= 0');
      spinnerCounter = 0;
      return;
    }

    spinnerCounter -= 1;
    trace(`Spinner count decreased to ${spinnerCounter}`);

    if (spinnerCounter > 0) {
      return;
    }

    host.removeChild(spin);
    spin = null;
    trace(' <- removed spinner');
  }

  function find2CXO(target) {
    if (!catalogProps.csc20.loaded) {
      reportLookupFailure('<p>The CSC 2.0 sources must be loaded ' +
                          'before they can be used in a search.</p>');
      return true; // TODO: should probably return false here
    }

    const nameIdx = getCSCColIdx('name');
    const matches = catalogProps.csc20.data.filter(d => d[nameIdx] === target);

    // Take the first match if any (shouldn't be multiple matches)
    //
    if (matches.length > 0) {
      const pos = catalogProps.csc20.getPos(matches[0]);
      setPosition(pos.ra, pos.dec, target);
      reportLookupSuccess(`Moving to ${target}`);
      return true;
    }

    return false;
  }

  // Supported formats:
  //     ens <n>
  //     ensemble <n>
  //     ens0xxxx00_001
  //
  // where n = 1 to 4404. A lot easier than trying to support multiple
  // formats and this is for testing purposes only. The target name
  // is expected to be in lower case.
  //
  // Returns true if the target was found.
  //
  function findEnsemble(target) {
    if (ensData === null) { return false; }

    let ens = null;
    let label = null;
    if (target.startsWith('ens0') && target.endsWith('00_001') &&
	target.length === 14) {
      label = target.slice(4, -6);
    } else if (target.startsWith('ensemble')) {
      label = target.slice(8);
    } else if (target.startsWith('ens')) {
      label = target.slice(3);
    } else {
      console.log(`findEnsemble: did not recognize ${target}`);
      return false;
    }

    ens = parseInt(label);
    if (isNaN(ens)) {
      console.log(`findEnsemble: Unable to parse ${target}`);
      return false;
    }

    const coords = ensData[ens];
    if (typeof coords === 'undefined') {
      console.log(`findEnsemble: no match for ${target}`);
      return false;
    }

    setPosition(coords.ra, coords.dec, `Ensemble ${ens}`);
    reportLookupSuccess(`Moving to ensemble ${ens}`);
    return true;
  }

  // click handler for targetFind.
  // - get user-selected name
  // - is it a stack name (CSC2, only if loaded)
  // - is it an ensemble name (CXC testing)
  // - is it a position; if so jump to it
  // - otherwise send it to the lookUP service
  //
  function findTargetName() {
    const target = document.querySelector('#targetName').value.trim();
    if (target === '') {
      // this should not happen, but just in case
      console.log(`Unexpected targetName=[${target}]`);
      return;
    }

    // Maybe it's a 2CXO name?
    // We can only do this if the catalog data has been downloaded.
    // For now we know the 2CXO names have not made it through to
    // Simbad or NED, so no point in continuing to them if we
    // have no match.
    //
    if (target.startsWith('2CXO J')) {
      find2CXO(target);
      return;
    }

    // Maybe it's an ensemble name: here we do fall through to other
    // checks (unlike 2CXO check).
    //
    const ltarget = target.toLowerCase();
    if (ltarget.startsWith('ens') ||
	ltarget.startsWith('ensemble ')) {
      if (findEnsemble(ltarget)) {
	return;
      }
    }

    // For now use a single comma as a simple indicator that we have
    // a location, and not a target name.
    //
    const toks = target.split(',');

    if (toks.length === 2) {
      const ra = strToRA(toks[0]);
      if (ra !== null) {
        const dec = strToDec(toks[1]);
        if (dec !== null) {

          var raVal = wwtprops.raToHTML(ra);
          var decVal = wwtprops.decToHTML(dec);

          const lbl = toks[0].trim() + ', ' + toks[1].trim();

          setPosition(ra, dec, lbl);
          reportLookupSuccess(`Moving to ${raVal} ${decVal}`);
          return;
        }
      }
    }

    // Maybe it's a stack name?
    //
    const smatches = inputStackData.stacks.filter(d => d.stackid === target);
    if (smatches.length > 0) {
      setPosition(smatches[0].pos[0], smatches[0].pos[1], target);
      reportLookupSuccess(`Moving to stack ${target}`);
      return;
    }

    // Got this far, assume the input is a name to be resolved.
    //
    const host = getHost();
    if (host === null) {
      return;
    }

    startSpinner();

    reportLookupSuccess(`Searching for ${target}`, false);

    // disable both the target widgets; note that on success both get re-enabled,
    // which is okay because the user-entered target is still
    // in the box (ie the box has text content), so targetFind can be enabled.
    //
    const targetName = document.querySelector('#targetName');
    const targetFind = document.querySelector('#targetFind');

    targetName.setAttribute('disabled', 'disabled');
    targetFind.setAttribute('disabled', 'disabled');

    const success = (ra, dec, service, category) => {

      stopSpinner();
      targetName.removeAttribute('disabled');
      targetFind.removeAttribute('disabled');

      setPosition(ra, dec, target);

      var msg;
      if (service) {
        msg = `<p>Location provided for ${target} by ${service}.</p>`;
      } else {
        msg = '<p>Location found.</p>';
      }

      // Augment this with ancillary information if available.
      //
      // Could search on avmdesc !== "" but then can get
      // "Object of unknown category" which doesn't look good.
      //
      if (category && category.avmcode !== '') {
        msg += '<p>Source category: <span class="source-category">' +
          category.avmdesc + '</span></p>';
      }

      reportLookupSuccess(msg);
    };

    const failure = (msg) => {
      stopSpinner();
      targetName.removeAttribute('disabled');
      targetFind.removeAttribute('disabled');

      reportLookupFailure(msg);
    };

    lookup.lookupName(target, success, failure);

  }

  // Based on
  // https://stackoverflow.com/questions/3955229/remove-all-child-elements-of-a-dom-node-in-javascript
  //
  function removeChildren(node) {
    while (node.firstChild) {
      node.removeChild(node.firstChild);
    }
  }

  // Mapping from short to long names, based on an analysis of a WTML
  // file created by WWT on Windows.
  //
  var wtml = {'wmap': 'WMAP ILC 5-Year Cosmic Microwave Background',
              'dust': 'SFD Dust Map (Infrared)',
              '2mass-cat': '2MASS: Catalog (Synthetic, Near Infrared)',
              '2mass-image': '2Mass: Imagery (Infrared)',
              'dss': 'Digitized Sky Survey (Color)',
              'vlss': 'VLSS: VLA Low-frequency Sky Survey (Radio)',
              'planck-cmb': 'Planck CMB',
              'planck-dust-gas': 'Planck Dust & Gas',
              'iris': 'IRIS: Improved Reprocessing of IRAS Survey (Infrared)',
              'wise': 'WISE All Sky (Infrared)',
              'halpha': 'Hydrogen Alpha Full Sky Map',
              'sdss': 'SDSS: Sloan Digital Sky Survey (Optical)',
              'tycho': 'Tycho (Synthetic, Optical)',
              'usnob1': 'USNOB: US Naval Observatory B 1.0 (Synthetic, Optical)',
              'galex4-nuv': 'GALEX 4 Near-UV',
              'galex4-fuv': 'GALEX 4 Far-UV',
              'galex': 'GALEX (Ultraviolet)',
              'rass': 'RASS: ROSAT All Sky Survey (X-ray)',
              'fermi3': 'Fermi Year Three (Gamma)'
             };

  // Special case the DSS image, since can just hide the foreground image
  // in this case.
  //
  // This also changes the window localStorage field: 'wwt-foreground'
  //
  function setImage(name) {
    trace(`setImage sent name=${name}`);
    if (name === 'dss') {
      wwt.setForegroundOpacity(0.0);
      saveState(keyForeground, name);
      return;
    }
    const fullName = wtml[name];
    if (typeof fullName === 'undefined') {
      console.log(`Unknown name: ${name}`);
      return;
    }
    wwt.setForegroundImageByName(fullName);
    wwt.setForegroundOpacity(100.0);
    saveState(keyForeground, name);
  }

  // Extract the data from this chunk and, if all chunks have
  // been read in, finalize things.
  //
  function processCatalogData(chunks, ctr, json) {
    if (json === null) {
      console.log(`WARNING: unable to download catalog data ${ctr}`);
      return;
    }

    trace(`Finalizing chunk ${ctr}`);

    // Validate the "schema"
    //
    const ncols = catalogDataCols.length;
    if (ncols !== json.cols.length) {
      console.log('ERROR: The catalog data is not correctly formatted!');
      return;
    }

    const diff = zip([catalogDataCols, json.cols]).reduce(
      (oflag, xs) => oflag || (xs[0] !== xs[1]),
      false);
    if (diff) {
      console.log('ERROR: invalid CSC schema!');
      console.log(' expected: ' + catalogDataCols);
      console.log(' received: ' + json.cols);
      return;
    }

    const props = catalogProps.csc20;
    if (props.data === null) {
      props.data = new Array(json.ntotal);
    }

    // What is the best way to fill in a slice of values of an array?
    //
    let i;
    for (i = 0; i < json.rows.length; i++) {
      props.data[json.start + i] = json.rows[i];
    }

    chunks[ctr - 1] = true;
    const haveCatalogData = chunks.reduce((a, v) => a && v, true);
    if (!haveCatalogData) { return; }

    props.loaded = true;

    const nsrcs = props.data.length;
    if (nsrcs !== json.ntotal) {
      console.log(`WARNING: CSC2.0 count expected ${json.ntotal} got ${nsrcs}`);
    }

    trace(`== CSC 2.0 contains ${nsrcs} sources`);

    // Report any missing sources
    //
    let nmiss = props.data.reduce((a, v) => {
      return a + typeof v === 'undefined' ? 1 : 0;
    }, 0);
    if (nmiss !== 0) {
      console.log(`WARNING: there are ${nmiss} missing sources in CSC 2.0!`);
    }

    // Let the user know they can "show sources"
    //
    const el = document.querySelector('#togglesources');
    el.innerHTML = 'Show CSC2.0 Sources';
    el.disabled = false;

    showBlockElement('sourcecolor');
    document.querySelector('#togglesourceprops')
      .style.display = 'inline-block';

    trace('Loaded CSC 2.0 data');
  }

  var ensData = null;
  function processEnsData(json) {
    if (json === null) {
      console.log('ERROR: unable to download ensemble data');
      return;
    }
    ensData = json;
  }

  // The CHS stuff is for testing, so do not try to optimise it just
  // now.
  //
  var chsData = null;
  function processCHSData(json) {
    if (json === null) {
      console.log('ERROR: unable to download CHS data');

      // leave as disabled
      document.querySelector('#togglechs')
        .innerHTML = 'Unable to load CHS catalog';
      return;
    }

    chsData = json;
    createCHSAnnotations();

    document.querySelector('#togglechs')
      .style.display = 'inline-block';

    trace('Loaded CHS data');
  }

  function processCatalog11Data(json) {
    if (json === null) {
      console.log('ERROR: unable to download catalog 1.1 data');

      // leave as disabled
      document.querySelector('#togglesources11')
        .innerHTML = 'Unable to load CSC1.1 catalog';
      return;
    }

    const props = catalogProps.csc11;

    props.data = json;
    props.loaded = true;

    const el = document.querySelector('#togglesources11');
    el.innerHTML = 'Show CSC1.1 Sources';
    el.disabled = false;

    showBlockElement('source11color');
    document.querySelector('#togglesource11props')
      .style.display = 'inline-block';

    trace('Loaded CSC 1.1 data');
  }

  function processXMMData(json) {
    if (json === null) {
      console.log('WARNING: unable to download XMM catalog data');

      // leave as disabled
      document.querySelector('#toggleXMMsources')
        .innerHTML = 'Unable to load XMM catalog';
      return;
    }

    trace('Processing XMM data');
    const props = catalogProps.xmm;

    trace(` from [${props.label}]`);
    props.label = json.catalog;
    trace(`   to [${props.label}]`);

    props.data = json.sources;
    props.loaded = true;

    // Let the user know they can "show XMM sources"
    //
    const el = document.querySelector('#toggleXMMsources');
    el.innerHTML = `Show ${props.label} Sources`;
    el.disabled = false;

    showBlockElement('xmmsourcecolor');

    document.querySelector('#togglexmmsourceprops')
      .style.display = 'inline-block';

    trace('Loaded XMM data');
  }

  // Most of these are likely to be removed or replaced
  // as they are here for debugging, or historical "accident"
  // (i.e. not removed when no-longer needed).
  //
  return {
    initialize: initialize,
    reinitialize: wwtReadyFunc(),
    resize: resize,
    unload: unload,

    getHost: getHost,

    clearNearestSource: clearNearestSource,
    clearNearestStack: clearNearestStack,
    clearRegionSelection: clearRegionSelection,

    copyToClipboard: copyToClipboard,
    copyCoordinatesToClipboard: copyCoordinatesToClipboard,

    zoomToSource: zoomToSource,
    zoomToStack: zoomToStack,

    addToolTipHandler: addToolTipHandler,
    removeToolTipHandler: removeToolTipHandler,

    processStackSelectionByName: processStackSelectionByName,
    processSourceSelection: processSourceSelection,

    // debug/testing access below
    //
    getWWTControl: function () { return wwt; },

    setPosition: setPosition,

    hideSources: hideSources,
    showSources: showSources,
    toggleSources: toggleSources,
    toggleSources11: toggleSources11,
    toggleXMMSources: toggleXMMSources,
    toggleStacks: toggleStacks,

    toggleCHS: toggleCHS,

    toggleSourceProps: toggleSourceProps,

    showPreSelected: showPreSelected,
    hidePreSelected: hidePreSelected,
    togglePreSelected: togglePreSelected,

    hideSettings: hideSettings,
    toggleSettings: toggleSettings,

    findNearestStack: findNearestStack,

    showBlockElement: showBlockElement,
    hideElement: hideElement,

    setImage: setImage,
    setSelectionMode: setSelectionMode,
    setTargetName: setTargetName,

    zoom: zoom,
    zoomIn: zoomIn,
    zoomOut: zoomOut,

    // 1.1 test
    loadSource11: downloadCatalog11Data,

    colorUpdate: colorUpdate,
    colorUpdate11: colorUpdate11,
    xmmColorUpdate: xmmColorUpdate,

    changeSourceSize: changeSourceSize,
    changeSource11Size: changeSource11Size,
    changeXMMSourceSize: changeXMMSourceSize,

    strToRA: strToRA, strToDec: strToDec,

    getProps: () => catalogProps,

    click: addAnnotationClicked,
    unclick: removeAnnotationClicked,

    clearState: clearState,
    switchSelectionMode: switchSelectionMode

  };

})();
