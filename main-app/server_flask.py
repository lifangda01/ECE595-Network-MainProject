#!/usr/bin/env python
from flask import *
import os

app = Flask(__name__)
app.config.update(dict(
    VIDEO_DIR=os.path.join(app.root_path, 'videos'),
    HLS_META='test.m3u8'
))

@app.route('/')
def index():
	return render_template('base.html')


@app.route('/transform', methods=['POST'])
def uploadAndDownload():
	file = request.files['data_file']
	if not file:
		return "No file uploaded"

	file_contents = file.stream.read()

	response = make_response(file_contents)
	response.headers["Content-Disposition"] = "attachment; filename=%s" % file.filename
	return response


@app.route('/query', methods=['GET'])
def queryAndDownload():
	filename = request.values['filename']
	filepath = os.path.join(app.config['VIDEO_DIR'], filename)
	if not os.path.isfile(filepath):
		return "Could not find requested file"
	# Content only...
	return send_from_directory(app.config['VIDEO_DIR'], filename)


@app.route('/<filename>')
def playVideo(filename):
	return render_template('videoplayer.html', title=filename)


@app.route('/hls/<filename>')
def playHLSVideo(filename):
	print filename
	return render_template('hlsvideoplayer.html', title=filename)


if __name__ == '__main__':
	app.run(host='0.0.0.0', threaded=True)