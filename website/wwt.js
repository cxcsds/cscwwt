
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

  const NCHUNK = 8;  // number of chunks for the source properties

  var wwt;

  // Why not ask WWT rather than keep track of these settings?
  //
  // Also, since they are initialized with a call to toggleXXX(),
  // the actual starting value is the inverse of this (so false
  // here means they are shown).
  //
  const displaySettings =
        { coordinateGrid: false,
          crosshairs: false,
          constellations: false,
          boundaries: true };

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

  // Store data about the supported catalogs.
  //    color, size  - how they are displayed (size in arcseconds)
  //    annotations  - null or a list of items, where each item is a
  //                   three-element list of ra, dec, WWT annotation
  //    shown        - a list of those annotations that are being displayed
  //                   (can be null when annotations is not null)
  //
  //
  const catalogProps = {
    csc20: { label: 'CSC2.0', button: '#togglesources',
             changeWidget: '#sourceprops',
             color: 'cyan', size: 5.0 / 3600.0,
             annotations: null, shown: null },
    csc11: { label: 'CSC1.1', button: '#togglesources11',
             changeWidget: 'source11props',
             color: 'orange', size: 7.0 / 3600.0,
             annotations: null, shown: null },
    xmm: { label: 'XMM', button: '#toggleXMMsources',
           changeWidget: 'xmmsourceprops',
           color: 'green', size: 10.0 / 3600.0,
           annotations: null, shown: null }
  };

  // Trying to rationalize the use and display of catalog data,
  // but for CSC 2.0 we store a lot more than we do for any other
  // catalog, so it isn't completely possible.
  //
  var shown_srcs_ids = [];

  var nearest_source = [];

  var xmm_catalog = null;
  var xmm_sources = [];

  // Was originally passing around the stack data to the functions
  // that needed it, but now store it.
  //
  var input_stackdata = undefined;

  // store the stack annotations (there can be multiple polygons per
  // stack)
  //
  var stack_annotations = {};
  var nearest_fovs = [];

  var stacks_shown = false;

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
    return arrays[0].map(function(_,i){
      return arrays.map(function(array){return array[i]})
    });
  }


  function toggleCoordinateGrid() {
    displaySettings.coordinateGrid = !displaySettings.coordinateGrid;
    wwt.settings.set_showGrid(displaySettings.coordinateGrid);
    wwt.settings.set_showEquatorialGridText(displaySettings.coordinateGrid);
  }

  function toggleCrosshairs() {
    displaySettings.crosshairs = !displaySettings.crosshairs;
    wwt.settings.set_showCrosshairs(displaySettings.crosshairs);
  }

  function toggleConstellations() {
    displaySettings.constellations = !displaySettings.constellations;
    wwt.settings.set_showConstellationFigures(displaySettings.constellations);
  }

  function toggleBoundaries() {
    displaySettings.boundaries = !displaySettings.boundaries;
    wwt.settings.set_showConstellationBoundries(displaySettings.boundaries);
  }

  // Change the zoom level if it is not too small or large
  // The limits are based on those used at
  // https://worldwidetelescope.gitbooks.io/worldwide-telescope-web-control-script-reference/content/webcontrolobjects.html#wwtcontrol-fov-property
  //
  function zoom(fov) {
    if (fov < 0.00022910934437488727) { return; }
    if (fov > 60) { return; }
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
    for (var stack of input_stackdata.stacks) {
      if (stack.stackid !== stackname) { continue; }
      wwt.gotoRaDecZoom(stack.pos[0], stack.pos[1], 1.0);
      wwtsamp.moveTo(stack.pos[0], stack.pos[1]);
      return;
    }
  }

  function zoomToSource(sourcename) {

    // Slightly optimise the name query as could be called
    // many times. Do not bother with ra/dec as only
    // called once.
    //
    const nameIdx = get_csc_colidx('name');
    if (nameIdx === null) {
      return;
    }

    for (var src of catalogData) {
      const sname = src[nameIdx];
      if (sname !== sourcename) { continue; }

      const ra = get_csc_row(src, 'ra');
      const dec = get_csc_row(src, 'dec');
      wwt.gotoRaDecZoom(ra, dec, 0.06);
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
    props.annotations.forEach(ann => {
      const cir = ann[2];
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
      props.annotations.forEach(ann => {
        const cir = ann[2];
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
        console.log('Invalid source size: [' + newSize + ']');
        return;
      }

      const size = newSize * 1.0 / 3600.0;
      props.size = size;
      props.annotations.forEach(ann => ann[2].set_radius(size));
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
  const copyToClipboard = str => {
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


  // This updates the stack_annotations dict
  //
  function addStackFOV(stack) {

    var edge_color;
    var fill_color = 'white';
    var line_width;
    var opacity = 0.1;
    var fill_flag = stack;

    if (stack.status) {
      edge_color = 'gold';
      line_width = 2;
      /* not sure having a filled region helps, so trying without it
         (the problem is the white fill can make the area look like
         it has a different signal to the surroundings, particularly
         when changing backgrounds).
         fill_flag = true;
      */
      fill_flag = false;
    } else {
      edge_color = 'grey';
      line_width = 1;
      fill_flag = false;
    };

    var annotations = [];
    // var ctr = 1;
    for (var i = 0; i < stack.polygons.length; i++) {

      // First is inclusive, the rest are exclusive
      const shapes = stack.polygons[i];

      for (var j = 0; j < shapes.length; j++) {
        const fov = wwt.createPolygon(fill_flag);

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

        fov.set_lineColor(edge_color);
        fov.set_lineWidth(line_width);

        fov.set_fillColor(fill_color);
        fov.set_opacity(opacity);

        const polygon = shapes[j];
        for(var p in polygon) {
          fov.addPoint(polygon[p][0], polygon[p][1]);
        }

        wwt.addAnnotation(fov);
        annotations.push(fov);

        // ctr += 1;
      }
    }

    stack_annotations[stack.stackid] = annotations;
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

  // Return an "annotation", which is a three-element array containing
  //    ra, dec, circle
  //
  function makeAnnotation(ra, dec, size, lineWidth, lineColor, fillColor, fillFlag, opacity) {
    const cir = wwt.createCircle(fillFlag);
    cir.setCenter(ra, dec);
    cir.set_skyRelative(true);
    cir.set_radius(size);
    cir.set_lineWidth(lineWidth);
    cir.set_lineColor(lineColor);
    cir.set_fillColor(fillColor);
    cir.set_opacity(opacity);

    return [ra, dec, cir];
  }

  // Note: set fill color if it has not been processed yet - not ideal
  //       as no way to change this color.
  //
  function makeSource(srcrow) {

    const src = get_csc_object(srcrow);
    if ((src.ra === null) || (src.dec === null)) {
      console.log('Err, no location for source:');
      console.log(src);
      return null;
    }

    const lineColor = src.nh_gal === null ? 'grey' :
      catalogProps.csc20.color;
    const fillColor = src.nh_gal === null ? 'grey' : 'white';

    const ann = makeAnnotation(src.ra, src.dec, catalogProps.csc20.size,
                               1, lineColor, fillColor, true, 0.1);

    // Note: add a label to indicate that this is unprocessed, so we know not to
    //       change the color later.
    //
    if (src.nh_gal === null) {
      ann[2].set_label('unprocessed');
    }

    return ann;
  }

  function makeSource11(src) {
    if ((src.ra === null) || (src.dec == null)) {
      console.log('Err, no location for CSC 1.1 source:');
      console.log(src);
      return null;
    }

    const color = catalogProps.csc11.color;
    return makeAnnotation(src.ra, src.dec, catalogProps.csc11.size,
                          1, color, color, true, 0.1);
  }

  function makeXMMSource(src) {

    const ra = src[0];
    const dec = src[1];
    if ((ra === null) || (dec === null)) {
      console.log('Err, no location for XMM source:');
      console.log(src);
      return null;
    }

    const color = catalogProps.xmm.color;
    return makeAnnotation(ra, dec, catalogProps.xmm.size,
                          1, color, color, true, 0.1);
  }

  // Let's see how the WWT does with all the stacks
  function addFOV(stackdata) {
    for (let stack of stackdata.stacks) {
      addStackFOV(stack);
    }
    stacks_shown = true;

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
  var mw_outlines = [];
  function addMW() {

    if (mw_outlines.length !== 0) {
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

    var edge_color = 'white';
    var line_width = 1;
    var fill_flag = false;

    // Create annotations and then, once all processed,
    // add them to WWT.
    //
    // Should we skip some of the layers? For instance, I think
    // most of id=ol1 isn't actually shown by WWT (as the polyline
    // is too large).
    //
    // var ctr = 1;
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

        // var outline = wwt.createPolygon(fill_flag);
        var outline = wwt.createPolyLine(fill_flag);

        /*
         * For now don't add an id/label based on issues
         * with the stack labels (see notes there).
         *
         var lbl = 'MW_' + ctr + '_' + j + '_' + features.id;
         outline.set_id(lbl);
         outline.set_label(features.id);
         outline.set_showHoverLabel(true);
        */

        outline.set_lineColor(edge_color);
        outline.set_lineWidth(line_width);

        // outline.set_fillColor(fill_color);
        // outline.set_opacity(opacity);

        var polygon = coords[j];
        for(var p in polygon) {
          var cs = lonlat2radec(polygon[p]);
          outline.addPoint(cs[0], cs[1]);
        }

        mw_outlines.push(outline);

        // ctr += 1;
      }
    }

    trace('Added MW');
  }

  var mw_shown = false;
  function toggleMW() {
    var label;
    if (mw_shown) {
      for (var i = 0; i < mw_outlines.length; i++) {
        wwt.removeAnnotation(mw_outlines[i]);
      }
      mw_shown = false;
      label = 'Show';
    } else {
      for (var i = 0; i < mw_outlines.length; i++) {
        wwt.addAnnotation(mw_outlines[i]);
      }
      mw_shown = true;
      label = 'Hide';
    }

    document.querySelector('#togglemw').innerHTML =
      label + ' Milky Way outline';

  }

  // Should perhaps determine the current state from the DOM,
  // but if anyone is messing around to affect this then they
  // can worry themselves.
  //
  var banners_shown = true;
  function toggleBanners() {
    var label, style;
    if (banners_shown) {
      label = 'Show';
      style = 'none';
      hideElement('cxcheaderright');
    } else {
      label = 'Hide';
      style = 'block';
      showBlockElement('cxcheaderright');
    }

    // Just find the first p within the footer
    document.querySelector('#cxcfooterright p')
      .style.display = style;

    document.querySelector('#togglebanners').innerHTML =
      label + ' banners';

    banners_shown = !banners_shown;
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
      console.log('Internal error: unable to find "' + sel + '"');
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
            .innerHTML = 'Unable to load ' + dataLabel;
	}
	return;
      }

      startSpinner();
      req.addEventListener('load', () => {
	trace('-- downloaded: ' + url);
	processData(req.response);
	stopSpinner();
      });
      req.addEventListener('error', () => {
	trace('-- error downloading:' + url);
	stopSpinner();
      });

      req.open('GET', url);
      req.responseType = 'json';
      req.send();
    };
  }

  function downloadCatalog20Data() {
      for (var ctr = 1; ctr <= NCHUNK; ctr++) {
	// Try without any cache-busting identifier
	const url = 'wwtdata/wwt_srcprop.' + ctr.toString() + '.json.gz';
	const func = makeDownloadData(url, '#togglesources',
				      'CSC2.0 catalog',
				      (d) => { processCatalogData(d, ctr); });
	func();
      }
  }

  // VERY experimental
  const downloadCHSData = makeDownloadData('wwtdata/chs.json',
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
      if (props.annotations === null) {
        console.log('Internal error: showCatalog ' + props.label +
                    ' called when no data exists!');
        return;
      }

      // Shouldn't be any shown, but just in case.
      //
      if (props.shown !== null) {
        props.shown.forEach(wwt.removeAnnotation);
        props.shown = null;
      }

      const ra0 = 15.0 * wwt.getRA(); // convert from hours
      const dec0 = wwt.getDec();
      const fov = wwt.get_fov();

      // The following forEach loop can alter props.shown
      //
      props.shown = [];
      props.annotations.forEach((d) => {
        const sep = separation(ra0, dec0, d[0], d[1]);
        if (sep < fov) {
          const ann = d[2];
          wwt.addAnnotation(ann);
          props.shown.push(ann);
        }
      });

      if (props.shown.length === 0) {
        reportUpdateMessage('No ' + props.label +
                            ' sources found in this area of the sky.');
        return;
      }

      document.querySelector(props.button).innerHTML =
        'Hide ' + props.label + ' Sources';
    };
  }

  // Create the function to hide the catalog.
  //   properties is the catalogProps.catalog field
  //
  function makeHideCatalog(props) {
    return () => {
      if (props.annotations === null) {
        console.log('Internal error: hideCatalog ' + props.label +
                    ' called when no data exists!');
        return;
      }

      if (props.shown === null) {
        console.log('Internal error: hideCatalog ' + props.label +
                    ' called when no data plotted!');
        return;
      }

      props.shown.forEach(wwt.removeAnnotation);
      props.shown = null;

      document.querySelector(props.button).innerHTML =
        'Show ' + props.label + ' Sources';

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
      if (props.annotations === null) {
        const el = document.querySelector(props.button);
        el.innerHTML = 'Loading ' + props.label + ' Sources';
        el.disabled = true;

        download();
        return;
      }

      if (props.shown === null) {
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
    } else {
      hideCHS();
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
    annotationsCHS.forEach(wwt.addAnnotation);

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
    annotationsCHS.forEach(wwt.removeAnnotation);

    document.querySelector('#togglechs').innerHTML =
      'Show CHS';
    shownCHS = false;
  }


  function toggleFlexById(elname) {
    const sel = '#' + elname;
    const el = document.querySelector(sel);
    if (el === null) {
      console.log('Internal error: unable to find "' + elname + '"');
      return;
    }

    // Assume that initially (when style.display is '') that
    // the item is hidden by a CSS rule.
    //
    var style;
    if (el.style.display === 'flex') {
      style = 'none';
    } else {
      style = 'flex';
    }

    el.style.display = style;
  }

  // Show the pane with the buttons that move to a location.
  //
  // I want this to appear near where the user clicked - hence sending
  // in the event - but it requires some cross-platform work so punting
  // for now.
  //
  var show_pre = false;
  function togglePreSelected(event) {
    if (show_pre) {
      hidePreSelected();
    } else {
      showPreSelected(event);
    }
  }

  function hidePreSelected() {
    hideElement('preselected');
    show_pre = false;
    document.querySelector('#togglepreselected').innerHTML =
      'Show Popular Places';
  }

  function showPreSelected(event) {

    var pane = document.querySelector('#preselected');

    // Trying to work out a good place to start the pane
    //
    // pane.style.left = evpos.x.toString() + 'px';
    // pane.style.top = evpos.y.toString() + 'px';

    // these are platform/font dependent...
    pane.style.left = '16em';
    pane.style.top = '4em';

    pane.style.display = 'block';

    show_pre = true;
    document.querySelector('#togglepreselected').innerHTML =
      'Hide Popular Places';
  }

  function toggleStacks() {
    var func, label;
    if (stacks_shown) {
      func = wwt.removeAnnotation;
      label = 'Show Stack Outlines';
      stacks_shown = false;
    } else {
      func = wwt.addAnnotation;
      label = 'Hide Stack Outlines';
      stacks_shown = true;
    }

    for (var stack in stack_annotations) {
      var fovs = stack_annotations[stack];
      for (var i = 0; i < fovs.length; i++) {
        func(fovs[i]);
      }
    }

    // could cache this
    document.querySelector('#togglestacks').innerHTML = label;

    // Only needed on 'hide stack' but do for both.
    clearNearestStack();
  }

  // Note: this *can* be called before the sources are loaded
  //       (primarily when zooming to a new location)
  //
  function hideSources() {
    _hideSources();

    // could cache these
    if (haveCatalogData) {
      // assume that the label can only have been changed
      // if the sources have been loaded
      document.querySelector('#togglesources').innerHTML =
        'Show CSC2.0 Sources';
    }

    document.querySelector('#selectionmode').innerHTML =
      'Select nearest stack';

    const sampEl = document.querySelector('#export-samp');
    sampEl.classList.remove('requires-samp');
    sampEl.style.display = 'none';

    ['plot-properties', 'sourceprops', 'plot'].forEach(hideElement);

    // Not 100% convinced whether we want this
    // wwtprops.clearSourceInfo();
    clearNearestSource();

    clickMode = processStackSelection;

  }

  function _hideSources() {

    const props = catalogProps.csc20;
    if (props.shown !== null) {
      props.shown.forEach(wwt.removeAnnotation);
      props.shown = null;
    }

    if (typeof sourceCircle !== 'undefined') {
      wwt.removeAnnotation(sourceCircle);
      sourceCircle = undefined;
    }

    source_ra = undefined;
    source_dec = undefined;
    source_fov = undefined;

    source_plotData = null;
  }

  function showSources() {
    const flag = _showSources();
    if (!flag) {
      reportUpdateMessage('No CSC 2 sources found in this area of the sky.');
      return;
    }

    // could cache these
    document.querySelector('#togglesources').innerHTML =
      'Hide CSC2.0 Sources';
    document.querySelector('#selectionmode').innerHTML =
      'Select nearest source';

    // Let the "is SAMP enabled" check sort out the display of this
    document.querySelector('#export-samp').
      classList.add('requires-samp');

    showBlockElement('plot-properties');

    clickMode = processSourceSelection;
  }

  var sourceCircle = undefined;
  var source_ra = undefined;
  var source_dec = undefined;
  var source_fov = undefined;

  var source_plotData = null;

  // Display the sources and create the data needed for the plots
  //
  function _showSources() {
    const ra0 = 15.0 * wwt.getRA(); // convert from hours
    const dec0 = wwt.getDec();
    const fov = wwt.get_fov();

    _hideSources();

    // Plot data
    const sig_b = [];
    const sig_w = [];
    const flux_b = [];
    const flux_w = [];

    const hr_hm = [];
    const hr_ms = [];

    const acis_num = [];
    const hrc_num = [];

    const r0 = [];
    const r1 = [];

    // Assume the FOV is the box size in degrees. Could
    // filter to fov / 2.0, but leave as fov just so that
    // if the user pans around a bit then the sources are
    // still shown. It also helps at the corners.
    //
    //
    shown_srcs_ids = [];

    const raIdx = get_csc_colidx('ra');
    const decIdx = get_csc_colidx('dec');

    const props = catalogProps.csc20;
    props.shown = [];

    for (var i = 0; i < catalogData.length; i++) {
      const srcrow = catalogData[i];
      const sep = separation(ra0, dec0,
                             srcrow[raIdx], srcrow[decIdx]);
      if (sep < fov) {
        // could access the elements without creating an object
        // but I don't want to change existing code too much
        const src = get_csc_object(srcrow);

        const circle = props.annotations[i][2];
        wwt.addAnnotation(circle);
        props.shown.push(circle);
        shown_srcs_ids.push(i);

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
          hr_hm.push(src.hard_hm);
          hr_ms.push(src.hard_ms);
        }

        if ((src.acis_num !== null) && (src.acis_num > 0)) {
          acis_num.push(src.acis_num);
        }
        if ((src.hrc_num !== null) && (src.hrc_num > 0)) {
          hrc_num.push(src.hrc_num);
        }

        if (src.significance !== null) {
          if (src.fluxband === 'broad') {
            flux_b.push(src.flux);
            sig_b.push(src.significance);
          } else if (src.fluxband === 'wide') {
            flux_w.push(src.flux);
            sig_w.push(src.significance);
          }
        }

      }
    }

    // can bail out now if there are no sources
    if (props.shown.length === 0) { return false; }

    // Combine the plot data
    //
    const out = {flux_b: null, flux_w: null, hr: null, poserr: null,
                 obscount: null};

    if (flux_b.length > 0) {
      out.flux_b = {sig: sig_b, flux: flux_b};
    }

    if (flux_w.length > 0) {
      out.flux_w = {sig: sig_w, flux: flux_w};
    }

    if (hr_hm.length > 0) {
      out.hr = {hm: hr_hm, ms: hr_ms};
    }

    if (r0.length > 0) {
      const eccen = zip([r0, r1]).map((z) => {
        const a = z[0];
        const b = z[1];
        return Math.sqrt(1 - b * b * 1.0 / (a * a));
      });
      out.poserr = {r0: r0, r1: r1, eccentricity: eccen};
    }

    if ((acis_num.length > 0) || (hrc_num.length > 0)) {
      out.obscount = {acis: acis_num, hrc: hrc_num};
    }

    source_plotData = out;

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

    source_ra = ra0;
    source_dec = dec0;
    source_fov = fov;

    return true;
  }


  // Return the angular sepration between the two points
  // Based on https://en.wikipedia.org/wiki/Great-circle_distance
  // and not worrying about rounding errors
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
    return Math.acos(term) * 180.0 / Math.PI;
  }

  // Note: this is used to set up the original data as well
  // as the now-removed update functionality. Should really
  // rename.
  //
  function updateCompletionInfo(status, stackdata) {

    const nstack_total = stackdata.stacks.length;

    var lmod_start, lmod_end;
    for (var i = 0; i < nstack_total; i++) {
      const stack = stackdata.stacks[i];
      stack.status = status.stacks[stack.stackid];
      /* if not completed then no element in the completed array */
      var completed = status.completed[stack.stackid]
      if (typeof completed !== 'undefined') {
        stack.lastmod = completed;
        if (typeof lmod_start === 'undefined') {
          lmod_start = completed;
          lmod_end = completed;
        } else if (completed < lmod_start) {
          lmod_start = completed;
        } else if (completed > lmod_end) {
          lmod_end = completed;
        }
      }
    }

    // The assumption is that these are both set
    stackdata.completed_start = lmod_start;
    stackdata.completed_end = lmod_end;

    document.querySelector('#nsrc_proc').innerHTML = '' +
      status.srcs_proc;
    document.querySelector('#nsrc_proc_pcen').innerHTML = '' +
      status.srcs_pcen;

    document.querySelector('#lastmod').innerHTML = status.lastupdate_db;

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

  function createSourceAnnotations() {

    const props = catalogProps.csc20;
    props.annotations = [];
    catalogData.forEach(src => {
      const ann = makeSource(src);
      if (ann !== null) {
        props.annotations.push(ann);
      }
    });

    // Let the user know they can "show sources"
    //
    const el = document.querySelector('#togglesources');
    el.innerHTML = 'Show CSC2.0 Sources';
    el.disabled = false;

    showBlockElement('sourcecolor');

    trace('Created source_annotations');
  }

  // Tweaking the "definition" of the CHS format as we work out
  // what we want
  function makeCHS(chs) {

    const ann = wwt.createPolygon(false);

    // Change the color based on whether it is an "original" hull
    // (pink) or a changed one (cyan)
    //
    const color = chs[0] ? 'cyan' : 'pink';
    ann.set_lineWidth(2);
    ann.set_lineColor(color);
    ann.set_fillColor(color);
    ann.set_opacity(0.6);

    const coords = chs[1];
    coords.forEach(p => { ann.addPoint(p[0], p[1]); });

    return ann;
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


  function createSource11Annotations() {

    const props = catalogProps.csc11;
    props.annotations = [];
    catalog11Data.forEach(src => {
      const ann = makeSource11(src);
      if (ann !== null) {
        props.annotations.push(ann);
      }
    });

    const el = document.querySelector('#togglesources11');
    el.innerHTML = 'Show CSC1.1 Sources';
    el.disabled = false;

    showBlockElement('source11color');

    trace('Created source11_annotations');
  }


  function createSettings() {
    toggleCoordinateGrid();
    toggleCrosshairs();
    toggleConstellations();
    toggleBoundaries();
    wwt.hideUI(true);
    trace('Set settings');
  }

  // A user click can mean
  //   - do nothing
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

    // Unlike the WWT position, this returns degrees (not hours)
    let ra = pos.get_RA();
    if (ra < 0) { ra += 360.0; }
    const dec = pos.get_dec();

    /***
        console.log('User selected ' + ra.toString() + ' ' +
        dec.toString());
    ***/

    clickMode(ra, dec);
  }

  // Very experimental. Maybe even Extremely Experimental.
  //
  // This does *not* update the UI to recognize the new
  // mode, nor does it add any checks (e.g. switch to source
  // mode when no sources are displayed).
  //
  function switchSelectionMode(mode) {
    if (mode === 'stack') {
      clickMode = processStackSelection;
    } else if (mode === 'source') {
      clickMode = processSourceSelection
    } else if (mode === 'region') {
      clickMode = processRegionSelection;
    } else {
      console.log('Unknown selection mode: ' + mode);
    }
  }

  // Show the nearest stack: ra and dec are in degrees
  function processStackSelection(sra0, sdec0) {

    clearNearestStack();

    // maximum separation to consider, in degrees.
    const maxSep = wwt.get_fov();

    const seps = [];
    for (var i = 0; i < input_stackdata.stacks.length; i++) {
      const stack = input_stackdata.stacks[i];
      const pos = stack.pos;
      const sep = separation(sra0, sdec0, pos[0], pos[1]);
      if (sep <= maxSep) {
        seps.push([sep, i, stack.stackid]);
      }
    }

    if (seps.length === 0) {
      return;
    }

    // Sort the list by the separation
    seps.sort(function (a, b) { if (a[0] < b[0]) { return -1; }
                                else if (a[0] > b[0]) { return 1; }
                                else { return 0; } });

    // Only interested in the closest stack
    //
    const stack = input_stackdata.stacks[seps[0][1]];
    const fovs = stack_annotations[seps[0][2]];
    for (var j = 0; j < fovs.length; j++) {
      const old_fov = [fovs[j],
                       fovs[j].get_lineColor(),
                       fovs[j].get_lineWidth()];

      fovs[j].set_lineColor('cyan');
      fovs[j].set_lineWidth(4);
      nearest_fovs.push(old_fov);
    }

    wwtprops.addStackInfo(stack, stackEventVersions);

  }

  // Can we lasso a region?
  //
  // TODO:
  //   - how do we cancel a selection
  //   - how do we end a selection
  //   - at each new point, remove any points within the polygon
  //     (i.e. any point that leads to an intersecting polygon)
  //   - store the coordinates of the points
  //   - add a marker at each vertex (help to see where the edges are)?
  //
  var region_polygon = undefined;
  function processRegionSelection(ra0, dec0) {
    if (typeof region_polygon === 'undefined') {
      region_polygon = wwt.createPolygon(true);
      region_polygon.set_lineColor('white');
      region_polygon.set_opacity(0.2);

      // This seems to work, even with no points
      wwt.addAnnotation(region_polygon);
    }
    // wwt.removeAnnotation(region_polygon);
    region_polygon.addPoint(ra0, dec0);
    // wwt.addAnnotation(region_polygon);
  }

  // Find the nearest source; we only have to loop through
  // the currently-drawn set.
  //
  // See processStackSelection
  //
  // ra and dec are in degrees
  function processSourceSelection(ra0, dec0) {

    // Should we check to see if the nearest source is the currently
    // selected one (i.e. if so can do nothing here).
    //
    clearNearestSource();

    // Unlike stacks, do not use the FOV to restrict the selection;
    // instead build it up as we go along (probably not worth it).
    //
    var maxSep = 1.0e9;
    const seps = [];
    for (var i = 0; i < shown_srcs_ids.length; i++) {
      const srcid = shown_srcs_ids[i];
      const src = catalogData[srcid];
      const ra = get_csc_row(src, 'ra');
      const dec = get_csc_row(src, 'dec');
      const sep = separation(ra0, dec0, ra, dec);
      if (sep <= maxSep) {
        seps.push([sep, srcid]);
        maxSep = sep;
      }
    }

    if (seps.length === 0) {
      return;
    }

    // Sort the list by the separation
    seps.sort(function (a, b) { if (a[0] < b[0]) { return -1; }
                                else if (a[0] > b[0]) { return 1; }
                                else { return 0; } });

    // Only interested in the closest item
    //
    const selid = seps[0][1];
    const src = catalogProps.csc20.annotations[selid][2];

    nearest_source = [src,
                      src.get_lineColor(),
                      src.get_fillColor(),
                      src.get_opacity()];

    src.set_lineColor(selectedSourceColor);
    src.set_fillColor(selectedSourceColor);
    src.set_opacity(selectedSourceOpacity);

    wwtprops.addSourceInfo(get_csc_object(catalogData[selid]));
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
    canvas.addEventListener('mousewheel', function(e) {
      e.preventDefault();
    });
    canvas.addEventListener('DOMMouseScroll', function(e) {
      e.preventDefault();
    });

    // Not sure what this is for, but ADS all-sky-survey do
    // it, so it must be good, right?
    canvas.onmouseout = function(e) {
      wwtlib.WWTControl.singleton.onMouseUp(e);
    };

    // Set up the drag handlers
    //
    host.addEventListener('dragover',
                          event => event.preventDefault());
    host.addEventListener('drop',
                          event => draggable.stopDrag(event));

    ['#stackinfo', '#sourceinfo', '#preselected', '#plot'].forEach((n) => {
      const pane = host.querySelector(n);
      if (pane !== null) {
        pane.draggable = true;
        pane.addEventListener('dragstart',
                              event => draggable.startDrag(event));
      } else {
        console.log('INTERNAL error: unable to find "' + n + '"');
      }
    });

    // Indicate we have already been called.
    excessScroll = true;

  }

  function resetLocation() {
    // Clear out the target name field, as can see it remain on
    // a page reload (possibly a Mozilla persistence thing).
    //
    setTargetName('');
    wwt.gotoRaDecZoom(ra0, dec0, startFOV, false);
    trace('Set up zoom to starting location');
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
      addFOV(input_stackdata);

      setupUserSelection();
      stopExcessScrolling();

      // Not 100% happy with the UI for indicating data to be
      // sent via Web-SAMP, but leave in for now.
      //
      loadStackEventVersions();

      // Try and restore the user's last settings.
      //
      const selImg = window.localStorage.getItem('wwt-foreground');
      if (selImg !== null) {
        setImage(selImg);
      }

      resetLocation();
      removeSetupBanner();

      wwtsamp.setup(reportUpdateMessage, trace);

      // Display the control panel
      //
      const panel = document.querySelector('#wwtusercontrol');
      if (panel === null) {
        console.log('Internal error: unable to find #wwtusercontrol!');
      } else {
        panel.style.display = 'block';
      }

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
      console.log('Error: invalid stackid=' + stackid);
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

    nearest_fovs.forEach((fov) => {
      fov[0].set_lineColor(fov[1]);
      fov[0].set_lineWidth(fov[2]);
    });
    nearest_fovs = [];
    wwtprops.clearStackInfo();
  }

  function clearNearestSource() {

    if (nearest_source.length < 1) { return; }

    const src = nearest_source[0];
    src.set_lineColor(nearest_source[1]);
    src.set_fillColor(nearest_source[2]);
    src.set_opacity(nearest_source[3]);
    nearest_source = [];
    wwtprops.clearSourceInfo();
  }

  function findNearestStack() {

    // getRA returns hours, not degrees, it seems.
    const ra0 = 15.0 * wwt.getRA();
    const dec0 = wwt.getDec();

    processStackSelection(ra0, dec0);
  }

  var _trace_ctr = 1;
  function trace(msg) {
    console.log('TRACE[' + _trace_ctr.toString() + '] ' + msg.toString());
    _trace_ctr += 1;
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
      wwtReadyFunc()();  // NOTE: the use of '()()' is intentional.
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
      console.log('WARNING: multiple calls to addToolTipHandler ' + name);
      return;
    }

    if (typeof timeout === 'undefined') { timeout = 3; }

    // what does a time out of 0 do?
    if (timeout <= 0) { timeout = 0; }

    const el = document.querySelector('#' + name);
    if (el === null) {
      console.log('Internal error [tooltip]: no element called "' +
                  name + '"');
      return;
    }

    const tooltip = name + '-tooltip';
    const tt = document.querySelector('#' + tooltip);
    if (tt === null) {
      console.log('Internal error [tooltip]: no element called "' +
                  tooltip + '"');
      return;
    }

    tooltipTimers[name] = null;

    el.addEventListener('mouseenter', () => {
      clearToolTipTimer(name);
      const timer = setTimeout(() => {
        tt.style.display = 'inline';
        const timer2 = setTimeout(() => {
          tt.style.display = 'none';
        }, timeout * 1000 );
        tooltipTimers[name] = timer2;
      }, 500);
      tooltipTimers[name] = timer;

    });
    el.addEventListener('mouseleave', () => {
      clearToolTipTimer(name);
      tt.style.display = 'none';
    });

    trace('set up tooltips for ' + name);
  }

  function removeToolTipHandler(name) {
    if (!(name in tooltipTimers)) {
      console.log('WARNING: removeToolTipHandler sent unknown ' + name);
      return;
    }

    delete tooltipTimers[name];
  }


  // Call on page load, when WWT is to be initialized.
  //
  var resize_state = true;

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

    // At present this just changes the box size/height
    resize();

    /* should have the stack "location" in the input file,
       but for now re-create it */
    for (let stack of obsdata.stacks) {
      stack.pos = decodeStackName(stack.stackid);
    }

    trace('recoded positions');

    input_stackdata = obsdata;

    // TODO: should this check that the name is not blank/empty?
    const tfind = host.querySelector('#targetFind');
    tfind.addEventListener('click', () => { findTargetName(); });

    /* Allow the user to start the search by hitting enter in the
     * search text box. The search button is only active when
     * there is text.
     */
    host.querySelector('#targetName')
      .addEventListener('keyup',
                        function(e) {
                          const val = this.value.trim();

                          // Ensure the submit button is only enabled when there is
                          // any text.
                          if (val === '') { tfind.disabled = true; return; }
                          else if (tfind.disabled) { tfind.disabled = false; };

                          if (e.keyCode !== 13) { return; }
                          tfind.click();
                        });

    // resize the user-control area
    host.querySelector('#resizeusercontrol')
      .addEventListener('click',
                        function() {
                          const smallify = host.querySelector('#smallify');
                          const bigify = host.querySelector('#bigify');

                          // I had placed the space on #wwtuserbuttons
                          // but this seemed to get "lost" on redisplay,
                          // so go with this awful approach of adding
                          // or removing it from the img as needed.
                          //
                          var state;
                          if (resize_state) {
                            smallify.style.display = 'none';
                            bigify.style.display = 'block';
                            state = 'none';
                            smallify.style.marginBottom = '0em';
                          } else {
                            smallify.style.display = 'block';
                            bigify.style.display = 'none';
                            state = 'block';
                            smallify.style.marginBottom = '0.4em';
                          }

                          host.querySelector('#wwtuserbuttons').style.display = state;
                          resize_state = !resize_state;
                        });

    // Zoom buttons
    //
    host.querySelector('#zoom0')
      .addEventListener('click', () => { zoom(60); });
    host.querySelector('#zoomin')
      .addEventListener('click', () => { zoomIn(); });
    host.querySelector('#zoomout')
      .addEventListener('click', () => { zoomOut(); });

    // SAMP button
    //
    host.querySelector('#export-samp')
      .addEventListener('click', () => {
        wwtsamp.sendSourcePropertiesNear(source_ra, source_dec, source_fov);
      });

    host.querySelector('#plot-properties')
      .addEventListener('click', () => { wwtplots.plotSources(source_plotData); });

    addToolTipHandler('zoom0');
    addToolTipHandler('zoomin');
    addToolTipHandler('zoomout');
    addToolTipHandler('export-samp');
    addToolTipHandler('plot-properties');

    addToolTipHandler('smallify');
    addToolTipHandler('bigify');

    addToolTipHandler('register-samp');

    addToolTipHandler('targetName', 20);
    addToolTipHandler('targetFind');

    // Do we show the 'show fullscreen' button?
    //
    // TODO: perhaps should just hard-code widths to 48%
    //
    if (wwtscreen.hasFullScreen()) {
      trace('found full screen support');

      host.querySelector('#togglebanners').style.width = '48%';

      const el = host.querySelector('#togglefullscreen');
      el.style.width = '48%';
      el.style.display = 'inline-block';

      el.addEventListener('click', () => wwtscreen.toggleFullScreen());

    } else {
      trace('no full screen support :-(');
    }

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
    });
    req.addEventListener('error', () => {
      alert('Unable to download the status of the CSC!');
    });

    // Do I need to add a cache-busting identifier?
    req.open('GET', 'wwtdata/wwt_status.json?' + (new Date()).getTime());
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
    if (div.style.width !== wstr ) {
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
        el.innerHTML = 'Full screen';
        wwtscreen.clearFullScreen();
      }
    } else if (el.innerHTML !== 'Full screen') {
      el.innerHTML = 'Full screen';
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
    pane.innerHTML = msg;
    pane.style.display = 'inline-block';

    if (close) {
      const cb = () => { pane.style.display = 'none' };
      setTimeout(cb, 4000);  // 4 seconds
    }

    // TODO: show / hide the close-pane button depending on close
    //       setting

  }

  function reportLookupFailure(msg) {
    hideElement('targetSuccess');

    const pane = document.querySelector('#targetFailure');
    if (pane === null) {
      // Assume it's not worth trying to recover
      return;
    }

    removeChildren(pane);

    const button = document.createElement('button');
    button.setAttribute('class', 'close');
    button.addEventListener('click', () => {
      hideElement('targetFailure');
      setTargetName('');
    });

    button.innerText = 'X';
    pane.appendChild(button);

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
    trace('Spinner count increased to ' + spinnerCounter);

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
    trace('Spinner count decreased to ' + spinnerCounter);

    if (spinnerCounter > 0) {
      return;
    }

    host.removeChild(spin);
    spin = null;
    trace(' <- removed spinner');
  }

  // click handler for targetFind.
  // - get user-selected name
  // - is it a position; if so jump to it
  // - otherwise send it to the lookUP service
  //
  function findTargetName() {
    const target = document.querySelector('#targetName').value.trim();
    if (target === '') {
      // this should not happen, but just in case
      console.log('Unexpected targetName=[' + target + ']');
      return;
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
          reportLookupSuccess('Moving to ' + raVal + ' ' +
                              decVal);
          return;
        }
      }
    }

    // Maybe it's a 2CXO name?
    // We can only do this if the catalog data has been downloaded.
    //
    if (target.startsWith('2CXO J')) {
      if (haveCatalogData) {
        const nameIdx = get_csc_colidx('name');
        const matches = catalogData.filter(d => d[nameIdx] === target);

        // Take the first match if any (shouldn't be multiple matches)
        //
        if (matches.length > 0) {
          const ra = get_csc_row(matches[0], 'ra');
          const dec = get_csc_row(matches[0], 'dec');
          setPosition(ra, dec, target);
          reportLookupSuccess('Moving to ' + target);
          return;
        }
      } else {
        reportLookupFailure('<p>The CSC 2.0 sources must be loaded ' +
                            'before they can be used in a search.</p>');
        return;
      }
    }

    // Maybe it's a stack name?
    //
    const smatches = input_stackdata.stacks.filter(d => d.stackid === target);
    if (smatches.length > 0) {
      setPosition(smatches[0].pos[0], smatches[0].pos[1], target);
      reportLookupSuccess('Moving to stack ' + target);
      return;
    }

    // Got this far, assume the input is a name to be resolved.
    //
    const host = getHost();
    if (host === null) {
      return;
    }

    startSpinner();

    reportLookupSuccess('Searching for ' + target, false);

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
        msg = '<p>Location provided for ' + target +
          ' by ' + service + '.</p>';
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
    const key = 'wwt-foreground';

    if (name === 'dss') {
      wwt.setForegroundOpacity(0.0);
      window.localStorage.setItem(key, name);
      return;
    }
    const fullName = wtml[name];
    if (typeof fullName === 'undefined') {
      console.log('Unknown name: ' + name);
      return;
    }
    wwt.setForegroundImageByName(fullName);
    wwt.setForegroundOpacity(100.0);
    window.localStorage.setItem(key, name);
  }

  // The CSC2 data is returned as an array of values
  // which we used to convert to a Javascript object (ie
  // one per row) since it makes it easier to handle.
  // However, it bloats memory usage, so we now retain
  // the array data and use the get_csc_row or get_csc_object
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
  function get_csc_colidx(column) {
    const colidx = catalogDataCols.indexOf(column);
    if (colidx < 0) {
      console.log('ERROR: unknown CSC column "' + column + '"');
      return null;
    }
    return colidx;
  }

  function get_csc_row(row, column) {
    return row[get_csc_colidx(column)];
  }

  // Convert a row to an object, to make data access easier.
  //
  function get_csc_object(row) {
    const out = Object.create({});
    zip([catalogDataCols, row]).forEach(el => { out[el[0]] = el[1] });
    return out

  }

  // Could try to merge the data sets as it is read in,
  // but for now keep it chunked until it is all read in.
  //
  var chunkedCatalogData = new Array(NCHUNK);
  var catalogData = [];
  var haveCatalogData = false;
  function processCatalogData(json, ctr) {
    if (json === null) {
      console.log('WARNING: unable to download catalog data ' +
                  ctr);
      return;
    }

    console.log('Finalizing chunk ' + ctr);

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

    chunkedCatalogData[ctr - 1] = json.rows;
    haveCatalogData = true;
    for (var cd of chunkedCatalogData) {
      haveCatalogData &= (typeof cd !== 'undefined');
    }

    if (!haveCatalogData) { return; }

    console.log('== unchunkifying');

    // We know the total size and chunk sizes, so could
    // use slices here
    //
    for (var chunk of chunkedCatalogData) {
      for (var src of chunk) {
        catalogData.push(src);
      }
    }

    chunkedCatalogData = null;
    createSourceAnnotations();

    document.querySelector('#togglesourceprops')
      .style.display = 'inline-block';

  }

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

  }


  var catalog11Data = [];
  var haveCatalog11Data = false;
  function processCatalog11Data(json) {
    if (json === null) {
      console.log('ERROR: unable to download catalog 1.1 data');

      // leave as disabled
      document.querySelector('#togglesources11')
        .innerHTML = 'Unable to load CSC1.1 catalog';
      return;
    }

    haveCatalog11Data = true;
    catalog11Data = json;
    createSource11Annotations();

    document.querySelector('#togglesource11props')
      .style.display = 'inline-block';

  }

  function processXMMData(json) {
    if (json === null) {
      console.log('WARNING: unable to download XMM catalog data');

      // leave as disabled
      document.querySelector('#toggleXMMsources')
        .innerHTML = 'Unable to load XMM catalog';
      return;
    }

    console.log('Processing XMM data');

    xmm_catalog = json.catalog;
    xmm_sources = json.sources;

    const props = catalogProps.xmm;

    console.log(' from [' + props.label + ']');
    props.label = xmm_catalog;
    console.log('   to [' + props.label + ']');

    props.annotations = [];
    for (let source of xmm_sources) {
      const ann = makeXMMSource(source);
      if (ann !== null) {
        props.annotations.push(ann);
      }
    }

    // Let the user know they can "show XMM sources"
    //
    const el = document.querySelector('#toggleXMMsources');
    el.innerHTML = 'Show ' + xmm_catalog + ' Sources';
    el.disabled = false;

    showBlockElement('xmmsourcecolor');

    document.querySelector('#togglexmmsourceprops')
      .style.display = 'inline-block';

    trace('Created xmm_annotations');

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

    clearNearestSource: clearNearestSource,
    clearNearestStack: clearNearestStack,

    copyToClipboard: copyToClipboard,

    zoomToSource: zoomToSource,
    zoomToStack: zoomToStack,

    addToolTipHandler: addToolTipHandler,
    removeToolTipHandler: removeToolTipHandler,

    // debug/testing access below
    //
    getWWTControl: function () { return wwt; },

    toggleCoordinateGrid: toggleCoordinateGrid,
    toggleCrosshairs: toggleCrosshairs,
    toggleConstellations: toggleConstellations,
    toggleBoundaries: toggleBoundaries,

    setPosition: setPosition,

    hideSources: hideSources,
    showSources: showSources,
    toggleSources: toggleSources,
    toggleSources11: toggleSources11,
    toggleXMMSources: toggleXMMSources,
    toggleStacks: toggleStacks,

    toggleCHS: toggleCHS,

    toggleFlexById: toggleFlexById,

    showPreSelected: showPreSelected,
    hidePreSelected: hidePreSelected,
    togglePreSelected: togglePreSelected,

    findNearestStack: findNearestStack,

    toggleMW: toggleMW,
    toggleBanners: toggleBanners,

    showBlockElement: showBlockElement,
    hideElement: hideElement,

    setImage: setImage,
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

    switchSelectionMode: switchSelectionMode
  };

})();
