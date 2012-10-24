
/**
 * Module dependencies.
 */

var express = require('express'),
    routes = require('./routes'),
    http = require('http'),
    path = require('path');

require('./db').updateDb(function (err) {
  if (err) {
    console.log(err);
    process.exit(1);
  }
});

var blogApp = express();

blogApp.configure(function(){
  blogApp.set('views', __dirname + '/views');
  blogApp.set('view engine', 'jade');
  blogApp.use(express.logger('dev'));
  blogApp.use(blogApp.router);
  blogApp.use(express.static(path.join(__dirname, 'public')));
});

blogApp.configure('development', function(){
  blogApp.use(express.errorHandler());
});

blogApp.locals.urlPrefix = '/blog'; // if you wanna serve this app directly under root, set this to ''

function appendSlashRedirect(req, res, next) {
  if (req.path == '/' && req.originalUrl[blogApp.locals.urlPrefix.length] != '/') { // the subroot slash is added by express
    res.writeHead(301, { 'Location': blogApp.locals.urlPrefix + req.url });
    res.end();
    return;
  }
  if (req.path[req.path.length-1] != '/') {
    res.writeHead(301, { 'Location': blogApp.locals.urlPrefix + req.path + '/' + req.url.substr(req.path.length) });
    res.end();
    return;
  }
  next();
}

blogApp.get('/', appendSlashRedirect, function(req, res) { // this is where our single-page application starts
  res.sendfile(__dirname + '/public/index.html');
});
blogApp.get(/^\/api\/categories\/?$/, appendSlashRedirect, routes.categories);
blogApp.get(/^\/api\/articles\/?$/, appendSlashRedirect, routes.index);
blogApp.get(/^\/api\/articles\/([a-z0-9-]+)\/?$/, appendSlashRedirect, routes.category);
blogApp.get(/^\/api\/article\/([a-z0-9-]+)\/([a-z0-9-]+)\/?$/, appendSlashRedirect, routes.article);
blogApp.get(/^\/api\/article\/([a-z0-9-]+\/[a-z0-9-]+\/.+\.[a-zA-Z0-9]{1,4})$/, function (req, res) {
  res.sendfile(__dirname + '/articles/' + req.params[0]);
});

var app = express();

app.configure(function() {
  app.set('port', process.env.PORT || 10000);
  app.use(blogApp.locals.urlPrefix, blogApp);
});

http.createServer(app).listen(app.get('port'), function(){
  console.log("Express server listening on port " + app.get('port'));
});
