$(document).ready(function() {

    var BV = new $.BigVideo({useFlashForFirefox:false});
    BV.init();
	if (Modernizr.touch) {
		BV.show('videos/video5.jpg');
	} else {
	    BV.show('videos/video5.mp4', {ambient:true});
	}	

	
}) 