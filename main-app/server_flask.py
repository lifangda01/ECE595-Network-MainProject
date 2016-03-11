#!/usr/bin/env python
from flask import Flask, make_response, request, render_template

app = Flask(__name__)

@app.route('/')
def index():
	return render_template('download.html')

@app.route('/transform', methods=['POST'])
def UploadandDownload():
	file = request.files['data_file']
	if not file:
		return "No file uploaded"

	file_contents = file.stream.read()

	response = make_response(file_contents)
	response.headers["Content-Disposition"] = "attachment; filename=%s" % file.filename
	return response

if __name__ == '__main__':
	app.run(host='0.0.0.0')