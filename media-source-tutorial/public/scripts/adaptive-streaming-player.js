$(function () {


    var BasicPlayer = function () {
        var self = this;
        self.clusters = [];
        self.renditions = ["180","360","480","720","1080"];
        self.avgBitrates = [];
        self.avgChunkSizes = [];
        // self.renditions = ["180","1080"];
        self.rendition = "1080";
        self.algorithm = "BBA1";
        self.MAXBUFFERLENGTH = 15; // Fetch ahead max 30s (the farthest cluster starts within 30s)

        function Cluster(fileUrl, rendition, byteStart, byteEnd, isInitCluster, timeStart, timeEnd) {
            this.byteStart = byteStart; //byte range start inclusive
            this.byteEnd = byteEnd; //byte range end exclusive
            this.timeStart = timeStart ? timeStart : -1; //timecode start inclusive
            this.timeEnd = timeEnd ? timeEnd : -1; //exclusive
            this.requested = false; //cluster download has started
            this.isInitCluster = isInitCluster; //is an init cluster
            this.queued = false; //cluster has been downloaded and queued to be appended to source buffer
            this.buffered = false; //cluster has been added to source buffer
            this.data = null; //cluster data from vid file

            this.fileUrl = fileUrl;
            this.rendition = rendition;
            this.requestedTime = null;
            this.queuedTime = null;

            this.size = byteEnd - byteStart;
            this.duration = timeEnd - timeStart;
            this.bitRate = this.size / this.duration;
        }

        Cluster.prototype.download = function (callback) {
            this.requested = true;
            this.requestedTime = new Date().getTime();
            this._getClusterData(function () {
                self.flushBufferQueue();
                if (callback) {
                    callback();
                }
            })
        };
        Cluster.prototype._makeCacheBuster = function () {
            var text = "";
            var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
            for (var i = 0; i < 10; i++)
                text += possible.charAt(Math.floor(Math.random() * possible.length));
            return text;
        };
        Cluster.prototype._getClusterData = function (callback, retryCount) {
            var xhr = new XMLHttpRequest();

            var vidUrl = self.sourceFile + this.rendition + '.webm';
            if (retryCount) {
                vidUrl += '?cacheBuster=' + this._makeCacheBuster();
            }
            xhr.open('GET', vidUrl, true);
            xhr.responseType = 'arraybuffer';
            xhr.timeout = 6000;
            xhr.setRequestHeader('Range', 'bytes=' + this.byteStart + '-' +
            this.byteEnd);
            xhr.send();
            var cluster = this;
            xhr.onload = function (e) {
                if (xhr.status != 206) {
                    console.err("media: Unexpected status code " + xhr.status);
                    return false;
                }
                cluster.data = new Uint8Array(xhr.response);
                cluster.queued = true;
                cluster.queuedTime = new Date().getTime();
                callback();
            };
            xhr.ontimeout = function () {
                var retryAmount = !retryCount ? 0 : retryCount;
                if (retryCount == 2) {
                    console.err("Given up downloading")
                } else {
                    cluster._getClusterData(callback, retryCount++);
                }
            }
        };
        this.clearUp = function () {
            if (self.videoElement) {
                //clear down any resources from the previous video embed if it exists
                $(self.videoElement).remove();
                delete self.mediaSource;
                delete self.sourceBuffer;
                self.clusters = [];
                self.rendition = "1080";
                self.networkSpeed = null;
                $('#factor-display').html("0.0000");
                $('#180-end').html("0.0");
                $('#180-start').html("0.0");
                $('#1080-end').html("0.0");
                $('#1080-start').html("0.0");
                $('#rendition').val("1080");
            }
        }

        this.initiate = function (sourceFile, clusterFile) {
            if (!window.MediaSource || !MediaSource.isTypeSupported('video/webm; codecs="vp8,vorbis"')) {
                self.setState("Your browser is not supported");
                return;
            }
            self.clearUp();
            self.sourceFile = sourceFile;
            self.clusterFile = clusterFile;
            self.setState("Downloading cluster file");
            self.downloadClusterData(function () {
                self.setState("Creating media source");
                //create the video element
                self.videoElement = $('<video controls></video>')[0];
                //create the media source
                self.mediaSource = new MediaSource();
                self.mediaSource.addEventListener('sourceopen', function () {
                    self.setState("Creating source buffer");
                    //when the media source is opened create the source buffer
                    self.createSourceBuffer();
                }, false);
                //append the video element to the DOM
                self.videoElement.src = window.URL.createObjectURL(self.mediaSource);
                $('#basic-player').append($(self.videoElement));
            });
        }
        this.downloadClusterData = function (callback) {
            console.log("downloadClusterData"); // Called only once on initialization
            var totalRenditions = self.renditions.length;
            var renditionsDone = 0;
            _.each(self.renditions, function (rendition) {
                var xhr = new XMLHttpRequest();

                var url = self.clusterFile + rendition + '.json';
                xhr.open('GET', url, true);
                xhr.responseType = 'json';

                xhr.send();
                xhr.onload = function (e) {
                    self.createClusters(xhr.response, rendition);
                    renditionsDone++;
                    if (renditionsDone === totalRenditions) {
                        callback();
                    }
                    console.log("downloadClusterData.onload: renditionsDone = ", renditionsDone, "totalRenditions = ", totalRenditions);
                };
            })
        }
        this.createClusters = function (rslt, rendition) {
            self.clusters.push(new Cluster(
                self.sourceFile + rendition + '.webm',
                rendition,
                rslt.init.offset,
                rslt.init.size - 1,
                true
            ));
            // console.log("createClusters: byteStart, byteEnd =", rslt.init.offset, rslt.init.size - 1, "(initCluster)");
            for (var i = 0; i < rslt.media.length; i++) {
                self.clusters.push(new Cluster(
                    self.sourceFile + rendition + '.webm',
                    rendition,
                    rslt.media[i].offset,
                    rslt.media[i].offset + rslt.media[i].size - 1,
                    false,
                    rslt.media[i].timecode,
                    (i === rslt.media.length - 1) ? parseFloat(rslt.duration / 1000) : rslt.media[i + 1].timecode));
                // console.log("createClusters: byteStart, byteEnd =", rslt.media[i].offset, rslt.media[i].offset + rslt.media[i].size - 1, 
                            // " timetart, timeEnd =", rslt.media[i].timecode, (i === rslt.media.length - 1) ? parseFloat(rslt.duration / 1000) : rslt.media[i + 1].timecode);
            }
        }
        this.createSourceBuffer = function () {
            self.sourceBuffer = self.mediaSource.addSourceBuffer('video/webm; codecs="vp8,vorbis"');
            self.sourceBuffer.addEventListener('updateend', function () {
                self.flushBufferQueue();
            }, false);
            self.setState("Downloading clusters");
            // Make sure downloadInitCluster and downloadCurrentCluster are both triggered
            self.downloadInitCluster(self.downloadCurrentCluster);
            self.getAverageBitrates();
            self.getAverageChunkSizes();
            self.videoElement.addEventListener('timeupdate', function () {
                self.downloadUpcomingClusters();
                if (self.algorithm == "BBA0") {
                    self.checkBufferingSpeedBBA0();
                } else if (self.algorithm == "BBA1") {
                    self.checkBufferingSpeedBBA1();
                } else {
                    self.checkBufferingSpeed();
                }
                self.removePlayedClusterFromBuffer();
            }, false);
        }
        this.removePlayedClusterFromBuffer = function () {
            // Remove the cluster that has been buffereed, is not initCluster and has finished
            var playedClusters = _.filter(self.clusters, function (cluster) {
                return (cluster.buffered === true && cluster.isInitCluster === false &&
                        cluster.timeEnd < self.videoElement.currentTime-1)
            });
            if (playedClusters.length) {
                _.each(playedClusters, function (cluster) {
                    cluster.buffered = false;
                    console.log("removePlayedClusterFromBuffer: removing", cluster.timeStart === -1 ? 0 : cluster.timeStart, cluster.timeEnd);
                    if (!self.sourceBuffer.updating) {
                        self.sourceBuffer.remove(cluster.timeStart === -1 ? 0 : cluster.timeStart, cluster.timeEnd);
                    }
                })
            };
        }

        this.flushBufferQueue = function () {
            if (!self.sourceBuffer.updating) {
                var initCluster = _.findWhere(self.clusters, {isInitCluster: true, rendition: self.rendition});
                // Make sure the initCluster is present in the buffer first
                if (initCluster.queued || initCluster.buffered) {
                    var bufferQueue = _.filter(self.clusters, function (cluster) {
                        return (cluster.queued === true && cluster.isInitCluster === false && cluster.rendition === self.rendition)
                    });
                    // If initCluster is not yet buffered, add it to the beginning of array
                    // This is only executed once for each rendition
                    if (!initCluster.buffered) {
                        // console.log("flushBufferQueue: buffer initCluster");
                        bufferQueue.unshift(initCluster);
                    }
                    // Buffer all queued data
                    if (bufferQueue.length) {
                        var concatData = self.concatClusterData(bufferQueue);
                        _.each(bufferQueue, function (bufferedCluster) {
                            bufferedCluster.queued = false;
                            bufferedCluster.buffered = true;
                        });
                        self.sourceBuffer.appendBuffer(concatData);
                    }
                    // _.each(bufferQueue, function (cluster) {
                    //     console.log("flushBufferQueue: cluster timeStart, timeEnd =", cluster.timeStart, cluster.timeEnd);
                    // });
                    var buf = self.sourceBuffer.buffered;
                    if (buf.length == 1) {
                        console.log("flushBufferQueue: sourceBuffer.buffered =", buf.start(0), buf.end(0));
                    }
                }
            }
        }
        this.downloadInitCluster = function (callback) {
            console.log("downloadInitCluster"); // Called every time switching rendition
            // initCluster is needed for decoding the rest of the video
            // Flush our queue of queued clusters such that the initialization cluster is always added first
            _.findWhere(self.clusters, {isInitCluster: true, rendition: self.rendition}).download(callback);
        }
        this.downloadCurrentCluster = function () {
            console.log("downloadCurrentCluster"); // Only called once after initial downloadInitCluster
            var currentClusters = _.filter(self.clusters, function (cluster) {
                // Current rendition && starting time less or equal to current play time
                return (cluster.rendition === self.rendition && cluster.timeStart <= self.videoElement.currentTime && cluster.timeEnd > self.videoElement.currentTime)
            });
            if (currentClusters.length === 1) {
                currentClusters[0].download(function () {
                    self.setState("Downloaded current cluster");
                });
            } else {
                console.err("Something went wrong with download current cluster");
            }
        }
        this.downloadUpcomingClusters = function () {
            // console.log("downloadUpcomingClusters");
            var nextClusters = _.filter(self.clusters, function (cluster) {
                // Not downloaded yet && current rendition && start time is within 5s from now
                if (typeof self.MAXBUFFERLENGTH === 'undefined') {
                    return (cluster.requested === false && cluster.rendition === self.rendition && 
                            cluster.timeStart > self.videoElement.currentTime && 
                            cluster.timeStart <= self.videoElement.currentTime + 5)
                } else {
                    // -5 because of the length of the cluster itself
                    return (cluster.requested === false && cluster.rendition === self.rendition && 
                            cluster.timeStart > self.videoElement.currentTime && 
                            cluster.timeStart <= self.videoElement.currentTime + self.MAXBUFFERLENGTH - 5)
                }
            });
            if (nextClusters.length) {
                self.setState("Buffering ahead");
                _.each(nextClusters, function (nextCluster) {
                    nextCluster.download();
                });
            } else {
                if (_.filter(self.clusters, function (cluster) {
                        return (cluster.requested === false )
                    }).length === 0) {
                    self.setState("Finished buffering whole video");
                } else {
                    self.finished = true;
                    self.setState("Finished buffering ahead");
                }
            }
        }
        this.switchRendition = function (rendition) {
            self.rendition = rendition;
            self.downloadInitCluster();
            self.downloadUpcomingClusters();
            $('#rendition').val(rendition);
        }
        this.concatClusterData = function (clusterList) {
            var bufferArrayList = [];
            _.each(clusterList, function (cluster) {
                bufferArrayList.push(cluster.data);
            });
            var arrLength = 0;
            _.each(bufferArrayList, function (bufferArray) {
                arrLength += bufferArray.length;
            });
            var returnArray = new Uint8Array(arrLength);
            var lengthSoFar = 0;
            _.each(bufferArrayList, function (bufferArray, idx) {
                returnArray.set(bufferArray, lengthSoFar);
                lengthSoFar += bufferArray.length;
            });
            return returnArray;
        };

        this.setState = function (state) {
            $('#state-display').html(state);
        }


        this.downloadTimeMR = _.memoize(
            function (downloadedClusters) {  // map reduce function to get download time per byte
                return _.chain(downloadedClusters
                        .map(function (cluster) {
                            return {
                                size: cluster.byteEnd - cluster.byteStart,
                                time: cluster.queuedTime - cluster.requestedTime
                            };
                        })
                        .reduce(function (memo, datum) {
                            return {
                                size: memo.size + datum.size,
                                time: memo.time + datum.time
                            }
                        }, {size: 0, time: 0})
                ).value()
            }, function (downloadedClusters) {
                return downloadedClusters.length; //hash function is the length of the downloaded clusters as it should be strictly increasing
            }
        );
        this.getClustersSorted = function (rendition) {
            // Sort buffered cluster with current rendition by starting time
            return _.chain(self.clusters)
                .filter(function (cluster) {
                    return (cluster.buffered === true && cluster.rendition == rendition && cluster.isInitCluster === false);
                })
                .sortBy(function (cluster) {
                    return cluster.byteStart
                })
                .value();
        }
        this.getNextCluster = function () {
            // Returns the next cluster to download in the current rendition
            var unRequestedUpcomingClusters = _.chain(self.clusters)
                .filter(function (cluster) {
                    return (!cluster.requested && cluster.timeStart >= self.videoElement.currentTime && cluster.rendition === self.rendition);
                })
                .sortBy(function (cluster) {
                    return cluster.byteStart
                })
                .value();
            if (unRequestedUpcomingClusters.length) {
                return unRequestedUpcomingClusters[0];
            } else {
                self.setState('Completed video buffering')
                throw new Error("No more upcoming clusters");
            }
        };
        this.getPrevClusterDownloadBytesPerSecond = function () {
            var prevCluster = _.filter(self.clusters, function (cluster) {
                return (cluster.queued || cluster.buffered)
            }).slice(-1)[0];
            var res;
            if (prevCluster != undefined) {
                res = (prevCluster.byteEnd - prevCluster.byteStart) /
                        ((prevCluster.queuedTime - prevCluster.requestedTime) / 1000);
            } else {
                res = 0;
            };
            // console.log("getPrevClusterDownloadBytesPerSecond: prevClusterMap MB/sec =", res/1000000);
            return res;
        }
        // Calculate the accumulative speed
        this.getDownloadTimePerByte = function () {    //seconds per byte
            var mapOut = this.downloadTimeMR(_.filter(self.clusters, function (cluster) {
                return (cluster.queued || cluster.buffered)
            }));
            var res = ((mapOut.time / 1000) / mapOut.size);
            // console.log("getDownloadTimePerByte: mapOut.time, mapOut.size =", mapOut.time, mapOut.size);
            return res;
        };
        // Calculate the reservoir size dynamically based on the nominal rendition
        this.getReservoirSize = function () {
            // Get the average bitrate of the lowest renditions first
            var R_avg = self.avgBitrates[0];
            // Reservoir size is determined by difference between the bitrates of future segments and the average
            // The plain way the paper calculates may not directly work on our example
            // This sometimes gets negative, need to map it to some positive value
            // How? Simple clipping may not work well (too often to be negative)
            var lowClusters = _.filter(self.clusters, function (cluster) {
                    return (cluster.rendition == self.renditions[0] && cluster.isInitCluster == false);
                });
            var Res = _.chain(lowClusters)
                .filter(function (cluster) {
                    // Get the clusters that haven't been played yet and start within X seconds
                    return (cluster.timeStart > self.videoElement.currentTime && 
                            cluster.timeStart < self.videoElement.currentTime + self.MAXBUFFERLENGTH);
                })
                .map(function (cluster) {
                    return (cluster.bitRate - R_avg) * cluster.duration;
                })
                .reduce(function (memo, datum) {
                    return memo + datum;
                }, 0)
                .value() / R_avg;
            // FIXME: hardcoded clipping
            if (Res <= 1) {
                Res = 2;
            } else {
                Res *= 2;
            };
            console.log("getReservoirSize: Res =", Res, Res / self.MAXBUFFERLENGTH);
            return Res;
        }
        this.getAverageBitrates = function () {
            self.avgBitrates = _.map(self.renditions, function (rendition) {
                var clusters = _.filter(self.clusters, function (cluster) {
                        return (cluster.rendition == rendition && cluster.isInitCluster == false);
                    });
                var R_avg = _.chain(clusters)
                    .map(function (cluster) {
                        return cluster.bitRate;
                    })
                    .reduce(function (memo, datum) {
                        return memo + datum;
                    }, 0)
                    .value() / clusters.length;   
                return R_avg;             
            });
            console.log("getAverageBitrates: avgBitrates =", self.avgBitrates);
        }
        this.getAverageChunkSizes = function () {
            self.avgChunkSizes = _.map(self.renditions, function (rendition) {
                var clusters = _.filter(self.clusters, function (cluster) {
                        return (cluster.rendition == rendition && cluster.isInitCluster == false);
                    });
                var C_avg = _.chain(clusters)
                    .initial()
                    .map(function (cluster) {
                        return cluster.size;
                    })
                    .reduce(function (memo, datum) {
                        return memo + datum;
                    }, 0)
                    .value() / (clusters.length - 1);   
                return C_avg;             
            });
            console.log("getAverageChunkSizes: avgChunkSizes =", self.avgChunkSizes);
        }
        this.getNextRenditionFromChunkMap = function () {
            var Res = self.getReservoirSize() / self.MAXBUFFERLENGTH;
            // Chunk Size (B)
            var C = self.avgChunkSizes;
            // Buffer Occupancy (s)
            // FIXME: fix the hardcodings...
            var B = [0.75, 0.90, 1.05, 1.20, 1.35];
            B = _.map(B, function (x) { return x + Res; })
            var C_p, C_m;
            var C_prev = C[_.indexOf(self.renditions, self.rendition)];
            var C_next;
            var r_i = self.renditions;
            var buf = self.sourceBuffer.buffered;
            var BO;
            var a = (C[C.length-1] - C[0]) / (B[B.length-1] - B[0]);
            var b = (C[0]*B[B.length-1] - C[C.length-1]*B[0]) / (B[B.length-1] - B[0]);
            if (buf.length >= 1) {
                BO = (buf.end(0) - buf.start(0)) / self.MAXBUFFERLENGTH;
            } else {
                // console.log("buf.length =", buf.length)
                BO = 0;
            }
            console.log("getNextRenditionFromChunkMap: BO =", BO);
            // Determine C_p and C_m
            if (C_prev === C[C.length-1]) {
                C_p = C[C.length-1];
            } else {
                C_p = C[_.indexOf(C, C_prev)+1];
            };
            if (C_prev === C[0]) {
                C_m = C[0];
            } else {
                C_m = C[_.indexOf(C, C_prev)-1];
            };
            // Look up the piecewise ratemap function
            if (BO < B[0]) {
                C_next = C[0];
            } else if (BO > B[B.length-1]) {
                C_next = C[C.length-1];
            } else {
                var C_f = a * BO + b;
                if (C_f >= C_p) {
                    C_next = C[_.sortedIndex(C, C_f)-1];
                } else if (C_f <= C_m) {
                    C_next = C[_.sortedIndex(C, C_f)];
                } else {
                    C_next = C_prev;
                };
                console.log("getNextRenditionFromChunkMap: C_f =", C_f);
            };
            // Returns the rendition...
            return r_i[_.indexOf(C, C_next)];   
        }
        this.getNextRenditionFromRateMap = function () {
            // In default example video, 1080P requires ~72000 B/s, 180P requires ~22000 B/s
            // var R = [45000, 70000, 100000, 220000, 400000];
            // var B = [0.65, 0.8, 0.95, 1.1, 1.25];
            // Bitrates (B/s)
            // FIXME: might as well use average bitrates
            var R = [45000, 70000, 100000, 220000, 400000];
            // Buffer Occupancy (s)
            var B = [0.75, 0.90, 1.05, 1.20, 1.35];
            var R_p, R_m;
            var R_prev = R[_.indexOf(self.renditions, self.rendition)];
            var R_next;
            var r_i = self.renditions;
            var buf = self.sourceBuffer.buffered;
            var BO;
            var a = (R[R.length-1] - R[0]) / (B[B.length-1] - B[0]);
            var b = (R[0]*B[B.length-1] - R[R.length-1]*B[0]) / (B[B.length-1] - B[0]);
            if (buf.length >= 1) {
                BO = (buf.end(0) - buf.start(0)) / self.MAXBUFFERLENGTH;
            } else {
                // console.log("buf.length =", buf.length)
                BO = 0;
            }
            console.log("getNextRenditionFromRateMap: BO =", BO);
            // Determine R_p and R_m
            if (R_prev === R[R.length-1]) {
                R_p = R[R.length-1];
            } else {
                R_p = R[_.indexOf(R, R_prev)+1];
            };
            if (R_prev === R[0]) {
                R_m = R[0];
            } else {
                R_m = R[_.indexOf(R, R_prev)-1];
            };
            // Look up the piecewise ratemap function
            if (BO < B[0]) {
                R_next = R[0];
            } else if (BO > B[B.length-1]) {
                R_next = R[R.length-1];
            } else {
                var R_f = a * BO + b;
                if (R_f >= R_p) {
                    R_next = R[_.sortedIndex(R, R_f)-1];
                } else if (R_f <= R_m) {
                    R_next = R[_.sortedIndex(R, R_f)];
                } else {
                    R_next = R_prev;
                };
                console.log("getNextRenditionFromRateMap: R_f =", R_f);
            };
            // Returns the rendition...
            return r_i[_.indexOf(R, R_next)];
        };
        this.checkBufferingSpeedBBA1 = function () {
            var prevClusterBytesPerSecond = self.getPrevClusterDownloadBytesPerSecond();
            var nextRendition = self.getNextRenditionFromChunkMap();

            $('#factor-display').html(Math.round(prevClusterBytesPerSecond / 1024) + "kB/s");

            var lowClusters = this.getClustersSorted("180");
            if (lowClusters.length) {
                $('#180-end').html(Math.round(lowClusters[lowClusters.length - 1].timeEnd*10)/10);
                $('#180-start').html(lowClusters[0].timeStart === -1 ? "0.0" : Math.round(lowClusters[0].timeStart*10)/10);
            }

            var highClusters = this.getClustersSorted("1080");
            if (highClusters.length) {
                $('#1080-end').html(Math.round(highClusters[highClusters.length - 1].timeEnd*10)/10);
                $('#1080-start').html(highClusters[0].timeStart === -1 ? "0.0" : Math.round(highClusters[0].timeStart*10)/10);
            }

            if (nextRendition !== self.rendition) {
                self.switchRendition(nextRendition);
            } else {
                // Do this if you want to move rendition up automatically
                // if (self.rendition !== "1080") {
                //    self.switchRendition("1080")
                // }
            }
        };
        this.checkBufferingSpeedBBA0 = function () {
            var prevClusterBytesPerSecond = self.getPrevClusterDownloadBytesPerSecond();
            var nextRendition = self.getNextRenditionFromRateMap();

            $('#factor-display').html(Math.round(prevClusterBytesPerSecond / 1024) + "kB/s");

            var lowClusters = this.getClustersSorted("180");
            if (lowClusters.length) {
                $('#180-end').html(Math.round(lowClusters[lowClusters.length - 1].timeEnd*10)/10);
                $('#180-start').html(lowClusters[0].timeStart === -1 ? "0.0" : Math.round(lowClusters[0].timeStart*10)/10);
            }

            var highClusters = this.getClustersSorted("1080");
            if (highClusters.length) {
                $('#1080-end').html(Math.round(highClusters[highClusters.length - 1].timeEnd*10)/10);
                $('#1080-start').html(highClusters[0].timeStart === -1 ? "0.0" : Math.round(highClusters[0].timeStart*10)/10);
            }

            if (nextRendition !== self.rendition) {
                self.switchRendition(nextRendition);
            } else {
                // Do this if you want to move rendition up automatically
                // if (self.rendition !== "1080") {
                //    self.switchRendition("1080")
                // }
            }
        };
        this.checkBufferingSpeed = function () {
            var secondsToDownloadPerByte = self.getDownloadTimePerByte();
            // console.log("checkBufferingSpeed: secondsToDownloadPerByte =", secondsToDownloadPerByte);
            var nextCluster = self.getNextCluster();
            var upcomingBytesPerSecond = (nextCluster.byteEnd - nextCluster.byteStart) / (nextCluster.timeEnd - nextCluster.timeStart);
            var estimatedSecondsToDownloadPerSecondOfPlayback = secondsToDownloadPerByte * upcomingBytesPerSecond;

            var overridenFactor = self.networkSpeed ? self.networkSpeed : Math.round(estimatedSecondsToDownloadPerSecondOfPlayback * 10000) / 10000;

            $('#factor-display').html(overridenFactor);

            var lowClusters = this.getClustersSorted("180");
            if (lowClusters.length) {
                $('#180-end').html(Math.round(lowClusters[lowClusters.length - 1].timeEnd*10)/10);
                $('#180-start').html(lowClusters[0].timeStart === -1 ? "0.0" : Math.round(lowClusters[0].timeStart*10)/10);
            }

            var highClusters = this.getClustersSorted("1080");
            if (highClusters.length) {
                $('#1080-end').html(Math.round(highClusters[highClusters.length - 1].timeEnd*10)/10);
                $('#1080-start').html(highClusters[0].timeStart === -1 ? "0.0" : Math.round(highClusters[0].timeStart*10)/10);
            }

            if (overridenFactor > 0.8) {
                if (self.rendition !== "180") {
                    self.switchRendition("180")
                }
            } else {
                //do this if you want to move rendition up automatically
                //if (self.rendition !== "1080") {
                //    self.switchRendition("1080")
                //}
            }
        }
    }

    var basicPlayer = new BasicPlayer();
    window.updatePlayer = function () {
        // var sourceFile = 'vidData/The_Bourne_Ultimatum';
        // var clusterData = 'vidData/The_Bourne_Ultimatum';
        var sourceFile = 'vidData/tbh/tbhFixed';
        var clusterData = 'vidData/tbh/tbhFixed';
        basicPlayer.initiate(sourceFile, clusterData);
    }
    updatePlayer();
    $('#rendition').change(function () {
        basicPlayer.switchRendition($('#rendition').val());
    });
    $('#simulate-button').click(function () {
        basicPlayer.networkSpeed = 2;
        $('#factor-display').html(2);
        $('#simulate-button').addClass('ww4-active');
    })
    $('#restart').click(function() {
        $('#simulate-button').removeClass('ww4-active');
        updatePlayer();
    });

});