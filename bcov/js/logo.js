// JavaScript Document
/* 
 * Lazy Line Painter - Path Object 
 * Generated using 'SVG to Lazy Line Converter'
 * 
 * http://lazylinepainter.info 
 * Copyright 2013, Cam O'Connell  
 *  
 */ 
 
var pathObj = {
    "logo": {
        "strokepath": [
            {
                "path": "      M9.181,14.018c0,0,0.1-4.602,4.038-4.602s43.28,0,43.28,0s4.371-0.246,4.371,4.609s0,95.515,0,95.515s0.221,4.688-5.046,4.67      c-5.268-0.018-42.073,0-42.073,0s-4.086-3.256,0.286-7.479s34.547-37.251,34.547-37.251s2.679-2.567,2.572-5.827",
                "duration": 600
            },
            {
                "path": "M 30.569 104.369 L 50.331 83.7",
                "duration": 600
            },
            {
                "path": "      M124.872,109.771c0,0-0.1,4.645-4.038,4.645s-43.28,0-43.28,0s-4.684,0.163-4.684-4.692s0-95.515,0-95.515      s-0.064-4.688,5.202-4.67c5.268,0.018,42.151,0,42.151,0s4.125,3.256-0.248,7.479c-4.372,4.224-34.527,37.251-34.527,37.251      s-2.669,2.589-2.563,5.849",
                "duration": 600
            },
            {
                "path": "M 103.483 19.379 L 83.722 40.048",
                "duration": 600
            }
        ],
        "dimensions": {
            "width": 132,
            "height": 124
        }
    }
}; 
 
 
/* 
 Setup and Paint your lazyline! 
 */ 
 
 $(document).ready(function(){ 
 $('#logo').lazylinepainter( 
 {
    "svgData": pathObj,
    "strokeWidth": 2,
    "strokeColor": "#e09b99"
}).lazylinepainter('paint'); 
 });