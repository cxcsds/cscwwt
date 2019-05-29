'use strict';

/* global alert */
/* global Plotly */
/* global wwt */

//
// Create plots for the WWT interface. At present this uses the Plotly
// service.
//

const wwtplots = (function () {

    const labelify = function(xs) {
        const n = xs.length;
        if (n === 0) {
            return '(no sources)';
        } else if (n === 1) {
            return '(one source)';
        } else {
            return `(${n} sources)`;
        }
    };

    const scatteropts = function(xs, ys, name) {
        const out = {x: xs, y: ys, opacity: 0.6,
    		     mode: 'markers', type: 'scatter'
    		    };
        if (typeof name !== 'undefined') {
    	    out.name = name + ' ' + labelify(xs);
        }
        return out;

    };

    /***
    const histopts = function(xs, name) {
        const bins = {start: -16.5, end: -9.5, size: 0.1};
        return {x: xs, type: 'histogram',
                name: name + ' ' + labelify(xs),
                opacity: 0.6, histnorm: 'percent',
                autobinx: false, xbins: bins};
    };
    ***/

    // Number of observations
    const histogramopts = function(xs, name) {
        const out = {x: xs, type: 'histogram',
                     opacity: 0.6,
		     // , histnorm: 'percent'
		    };
	if (typeof name !== 'undefined') {
	    out.name = name + ' ' + labelify(xs);
	}
	return out;
    };

    // significance vs plot
    //
    function setupFluxPlot(plotData) {

	const data = [];
	var sig, flux;

	const have_b = plotData.flux_b !== null;
	const have_w = plotData.flux_w !== null;

	// Scale flux to units of 1e-16 since plotly tries to be
	// too clever with the axis units

	if (have_b) {
	    // sig = plotData.flux_b.sig.map(Math.log10);
	    // flux = plotData.flux_b.flux.map(Math.log10);

	    sig = plotData.flux_b.sig;
	    flux = plotData.flux_b.flux.map((f) => { return f * 1e16; });

	    data.push(scatteropts(sig, flux, 'broad band'));
	}

	if (have_w) {
	    // sig = plotData.flux_w.sig.map(Math.log10);
	    // flux = plotData.flux_w.flux.map(Math.log10);

	    sig = plotData.flux_w.sig;
	    flux = plotData.flux_w.flux.map((f) => { return f * 1e16; });

	    data.push(scatteropts(sig, flux, 'wide band'));
	}

	if (data.length === 0) { return null; }

	// Since a legend is only shown when both data sets are
	// displayed, use the plot title to provide the band
	//
	let title = 'Aperture-corrected fluxes';
	if (data.length === 1) {
	    if (have_b) { title += ' (broad)'; }
	    else        { title += ' (wide)'; }
	}

	return {data: data,
		opts: {title: title,
		       xaxis: {title: 'Significance',
			       autorange: true,
			       type: 'log'
			      },
		       yaxis: {title: 'flux (10⁻¹⁶ erg/cm²/s)',
			       autorange: true,
			       type: 'log'}
                      }
	       };
    }

    function setupPosErrPlot(plotData) {

	if (plotData.poserr === null) { return null; }

	return {data: [scatteropts(plotData.poserr.r0,
				   plotData.poserr.eccentricity)],
		opts: {title: 'Positional error (95%)',
		       xaxis: {title: 'Major axis (arcsec)',
			       autorange: true,
			       type: 'log'
			      },
		       yaxis: {title:
			       'Eccentricity (√1-minor²/major²)'
			      }
                      }
	       };
    }

    function setupHRPlot(plotData) {

	if (plotData.hr === null) { return null; }

	// TODO: force axis limits -1 to 1
	return {data: [{x: plotData.hr.ms, y: plotData.hr.hm,
		       autobinx: false, autobiny: false,
		       xbins: {start: -1, end: 1, size: 0.1},
		       ybins: {start: -1, end: 1, size: 0.1},
			type: 'histogram2d'}],
		opts: {title: 'Hardness ratios',
		       xaxis: {title: 'Medium - Soft'},
		       yaxis: {title: 'Hard - Medium'}
		      }
	       };
    }

    function setupNobsPlot(plotData) {

	if (plotData.obscount === null) { return null; }

	const data = [];
	const have_acis = plotData.obscount.acis.length > 0;
	const have_hrc = plotData.obscount.hrc.length > 0;

	if (have_acis) {
	    data.push(histogramopts(plotData.obscount.acis,
				    'ACIS observations'));
	}

	if (have_hrc) {
	    data.push(histogramopts(plotData.obscount.hrc,
				    'HRC observations'));
	}

	if (data.length === 0) { return null; }

	let title;
	if (data.length === 1) {
	    if (have_acis) { title = 'ACIS'; }
	    else           { title = 'HRC'; }
	} else {
	    title = 'Chandra';
	}
	title += ' observations per detection';

	return {data: data,
		opts: {title: title,
		       barmode: 'overlay',
		       xaxis: {title: 'Number of observations'},
		       yaxis: {title: 'Number of sources'}
                      }
	       };
    }

  // Taken from https://stackoverflow.com/a/10284006
  //
  function zip(arrays) {
    return arrays[0].map(function(_, i){
      return arrays.map(function(array) { return array[i]; })
    });
  }

    function createPlotData(catinfo) {

      // This function has been moved out of the "show sources" code,
      // and so there are likely chances for improvements and
      // simplifications.
      //

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

      catinfo.annotations.forEach(ann => {
	// If the source is currently hidden, do not include in the plots
	if ((typeof ann.shown !== 'undefined') && !ann.shown) {
	  return;
	}

	const src = wwt.getCSCObject(ann.data);

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
      });

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

      return out;
    }

    // Plot the properties of the selected sources, given the
    // catalog information (i.e. the object containing an annotations
    // field). If an annotation object has the shown field and it is
    // false then the annotation is skipped.
    //
    //   significance vs flux (b and w separately)
    //   hr (hm vs ms)
    //   r0 vs r1
    //   histogram of acis_num, hrc_num
    //
    function plotSources(catinfo) {
      if ((catinfo === null) || (catinfo.annotations === null)) {
	    console.log('No sources to plot');
	    return;
	}

        const plotData = createPlotData(catinfo);
	const p1 = setupFluxPlot(plotData);
	const p2 = setupPosErrPlot(plotData);
	const p3 = setupHRPlot(plotData);
	const p4 = setupNobsPlot(plotData);

	// TODO: the "plot" button should not be active in this case
	//
	if ((p1 === null) && (p2 === null) && (p3 === null) && (p4 === null)) {
	    // console.log("No sources with data to plot");
	    alert('The CSC sources in the selected region do not\n' +
		  'have properties to plot (they are too faint\n' +
		  'or have not yet been fully processed.');
	    return;
	}

	const plot1 = document.querySelector('#plot1');
	const plot2 = document.querySelector('#plot2');
	const plot3 = document.querySelector('#plot3');
	const plot4 = document.querySelector('#plot4');

	// newPlot claims to do this but not convinced; always ensure the
	// plot is cleared even if there is none to draw
	//
	// The following is ugly code and needs a re-think.
	//
	/*  not needed with Plotly.react?
	Plotly.purge(plot1);
	Plotly.purge(plot2);
	Plotly.purge(plot3);
	Plotly.purge(plot4);
	*/

	let nplots = 0;
	let defaultPlot = 0;

	const plotShown = [false, false, false, false];
	const genOpts = {displayModeBar: true};

	if (p1 !== null) {
	    // Plotly.newPlot(plot1, p1.data, p1.opts, genOpts);
	    Plotly.react(plot1, p1.data, p1.opts, genOpts);
	    defaultPlot = 1;
	    plotShown[0] = true;
	    nplots += 1;
	}

	if (p2 !== null) {
	    // Plotly.newPlot(plot2, p2.data, p2.opts, genOpts);
	    Plotly.react(plot2, p2.data, p2.opts, genOpts);
	    if (nplots === 0) { defaultPlot = 2; }
	    plotShown[1] = true;
	    nplots += 1;
	}

	if (p3 !== null) {
	    // Plotly.newPlot(plot3, p3.data, p3.opts, genOpts);
	    Plotly.react(plot3, p3.data, p3.opts, genOpts);
	    if (nplots === 0) { defaultPlot = 3; }
	    plotShown[2] = true;
	    nplots += 1;
	}

      // Have a problem with p4; may happen with other plots too
      // but for now just handle the p4 failure case.
      //
	if (p4 !== null) {
	  // Plotly.newPlot(plot4, p4.data, p4.opts, genOpts);
	  let p4okay = true;
	  try {
	    Plotly.react(plot4, p4.data, p4.opts, genOpts);
	  } catch (e) {
	    console.log(`DBG: plotly (p4) threw ${e}`);
	    p4okay = false;
	  }

	  if (p4okay) {
	    if (nplots === 0) { defaultPlot = 4; }
	    plotShown[3] = true;
	    nplots += 1;
	  }
	}

	// Make sure display areas are reset; also need to toggle the
	// buttons too. Easiest to just hide them all and then
	// turn back on the default plot.
	//
	const plot1area = document.querySelector('#plot1area');
	const plot2area = document.querySelector('#plot2area');
	const plot3area = document.querySelector('#plot3area');
	const plot4area = document.querySelector('#plot4area');

	plot1area.style.display = 'none';
	plot2area.style.display = 'none';
	plot3area.style.display = 'none';
	plot4area.style.display = 'none';

	const plot1sel = document.querySelector('#plot1sel');
	const plot2sel = document.querySelector('#plot2sel');
	const plot3sel = document.querySelector('#plot3sel');
	const plot4sel = document.querySelector('#plot4sel');

	// clear them all to ensure only one is set
	plot1sel.checked = false;
	plot2sel.checked = false;
	plot3sel.checked = false;
	plot4sel.checked = false;

	if (defaultPlot === 1) {
	    plot1area.style.display = 'block';
	    plot1sel.checked = true;
	} else if (defaultPlot === 2) {
	    plot2area.style.display = 'block';
	    plot2sel.checked = true;
	} else if (defaultPlot === 2) {
	    plot3area.style.display = 'block';
	    plot3sel.checked = true;
	} else if (defaultPlot === 3) {
	    plot4area.style.display = 'block';
	    plot4sel.checked = true;
	}

	const el = document.querySelector('#plotchoice');

	if (nplots < 2) {
	    el.style.display = 'none';
	} else {
	    const showLabel = (flag, plotlbl, plotsel) => {
		const lblstyle = flag ? 'inline' : 'none';
		document.querySelector('#' + plotlbl).style.display = lblstyle;
		// var selstyle = flag ? 'inline-block' : 'none';
		// plotsel.style.display = selstyle;
	    }

	    showLabel(plotShown[0], 'plot1lbl', plot1sel);
	    showLabel(plotShown[1], 'plot2lbl', plot2sel);
	    showLabel(plotShown[2], 'plot3lbl', plot3sel);
	    showLabel(plotShown[3], 'plot4lbl', plot4sel);

	    el.style.display = 'block';

	}

	document.querySelector('#plot').style.display = 'block';

    }

  return { plotSources: plotSources };

})();
