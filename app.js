
/**
 * Module dependencies.
 */

var express = require('express'),
    routes = require('./routes'),
    http = require('http'),
    path = require('path');

var app = express();

app.configure(function(){
  app.set('port', process.env.PORT || 10000);
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.logger('dev'));
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(app.router);
  app.use(express.static(path.join(__dirname, 'public')));
});

app.configure('development', function(){
  app.use(express.errorHandler());
});

app.locals.url_prefix = '/blog';

app.get('/', routes.index);
app.get(/^\/([a-z0-9-]+)$/, routes.category);
app.get(/^\/([a-z0-9-]+)\/([a-z0-9-]+)$/, routes.article);
app.get(/^\/[a-z0-9-]+\/[a-z0-9-]+\/.+\.[a-zA-Z0-9]{1,4}$/, function (req, res) {
  res.sendfile(__dirname + '/articles' + req.url);
});

http.createServer(app).listen(app.get('port'), function(){
  console.log("Express server listening on port " + app.get('port'));
});
