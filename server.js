var express = require('express');
var app = express();
var multipart = require('connect-multiparty');
var multipartMiddleware = multipart();
var io = require('socket.io');
var serv_io = io.listen(3300);
var path = require('path');
var mkdirp = require('mkdirp');
var fs = require('fs');
var redis = require("redis");
var client = redis.createClient();

// if there is an error connecting to database
client.auth("cac_rc_2016", function(err) {
    if (err) {
        console.log("Error " + err);
    } else {
        console.log("connected to database")
    }
});

// serve files
app.use('/images', express.static(__dirname + '/public/images'));
app.use('/uploads', express.static(__dirname + '/uploads'));

// stablish a deadline for the time counter
var dString = "june, 1, 2016";

//render the form in the file index.html
app.get('/', function(req, res) {
    res.sendFile(path.join(__dirname + '/public/index.html'), function(err) {
        if (err) {
            res.status(err.status).end();
        }
    });
    setInterval(function() {
        var t = DateDiff();
        serv_io.emit('time', t);
        // console.log("time sent");
    }, 1000);
});

//jury login
app.get('/login', function(req, res) {
    res.sendFile(path.join(__dirname + '/public/jury.html'), function(err) {
        if (err) {
            res.status(err.status).end();
        }
    });
});

//jury interface
app.post('/review', multipartMiddleware, function(req, res) {
    //console.log(req.body);
    client.get("juror:1", function(err, data) {
        var obj = JSON.parse(data);
        if (req.body.login == obj.name && req.body.pass == obj.password) {
            console.log("juror logged in!");
            res.sendFile(path.join(__dirname + '/public/review.html'), function(err) {
                if (err) {
                    res.status(err.status).end();
                }
            });
            client.get("users", function(err, data) {
                var count = 0;
                //iterate through each user in database
                for (var i = 0; i < data; i++) {
                    client.get("user:" + (i + 1), function(err, stored) {
                        //console.log(JSON.parse(stored));
                        setTimeout(function() {
                            serv_io.emit('review', stored);
                            count++;
                            //send signal when all data is loaded to close the socket
                            if (count == parseInt(data)) {
                                serv_io.emit('ended', true);
                                console.log("All data sent!")
                            }
                        }, 1000);
                    });
                }
            });
        } else {
            console.log("WRONG!");
            res.send("wrong login credentials, please contact admin.");
        }
    });
});

//test route to see the data in the db
app.get('/users', function(req, res) {
    client.get("users", function(err, data) {
        //console.log(data);
        //console.log("////////////////////");
        //iterate through each user in database
        var newObj = [];
        for (var i = 0; i < data; i++) {
            client.get("user:" + (i + 1), function(err, obj) {
                console.log(JSON.parse(obj));
                newObj.push(obj);
                if (i == (data - 1)) {
                    res.send(newObj);
                }
            });
        }
    });
});

// POST /submitted gets urlencoded bodies 
app.post('/submitted', multipartMiddleware, function(req, res) {
    // console.log(req.body, req.files);
    var obj = { data: null, files: null };
    obj.data = req.body;
    obj.files = req.files;
    //console.log(obj);

    client.incr('users', function(err, id) {
        client.set('user:' + id, JSON.stringify(obj));
    });

    mkdirp('./uploads/' + req.body.name, function(err) {
        if (err) {
            console.log(err);
        } else {
            fs.readFile(req.files.proposal.path, function(err, data) {
                var newPath = __dirname + "/uploads/" + req.body.name + "/" + req.files.proposal.originalFilename;
                fs.writeFile(newPath, data, function(err) {
                    if (err) {
                        console.log(err);
                    }
                });
            });
            fs.readFile(req.files.cv.path, function(err, data) {
                var newPath = __dirname + "/uploads/" + req.body.name + "/" + req.files.cv.originalFilename;
                fs.writeFile(newPath, data, function(err) {
                    if (err) {
                        console.log(err);
                    }
                });
            });
            res.send(
                "<style>" +
                "h1{" +
                "font-size: 55px;" +
                "}" +
                "h2{" +
                "font-size: 35px;" +
                "line-height: 5px;" +
                "}" +
                "</style>" +
                "<h1>Thank You!</h1>" +
                "<h2>Your submission is complete.</h2>" +
                "<h2>We will contact you soon.</h2>"
            );
        }
    });
});

// Create a page for each applicant
app.get('/applicant', function(req, res) {
    var applicantName = req.query["id"];
    client.get("users", function(err, data) {
        //iterate through each user in database
        for (var i = 0; i < data; i++) {
            client.get("user:" + (i + 1), function(err, obj) {
                var parsed = JSON.parse(obj);
                //console.log(parsed.data.name)
                if (parsed.data.name != null) {
                    if (parsed.data.name == applicantName) {
                        res.sendFile(path.join(__dirname + '/public/applicant.html'), function(err) {
                            if (err) {
                                res.status(err.status).end();
                            } else {
                                setTimeout(function() {
                                    serv_io.emit('applicant', parsed);
                                }, 1000);
                            }
                        });
                    }
                }
            });
        }
    });
});

// Get time Left
function DateDiff() {
    date_future = new Date(new Date(dString));
    date_now = new Date();
    seconds = Math.floor((date_future - (date_now)) / 1000);
    minutes = Math.floor(seconds / 60);
    hours = Math.floor(minutes / 60);
    days = Math.floor(hours / 24);
    hours = hours - (days * 24);
    minutes = minutes - (days * 24 * 60) - (hours * 60);
    seconds = seconds - (days * 24 * 60 * 60) - (hours * 60 * 60) - (minutes * 60);
    return (days + "d:" + hours + "h:" + minutes + "m:" + seconds + "s");
}

//Start Server
app.listen(3000, function() {
    console.log('listening on port 3000')
});
