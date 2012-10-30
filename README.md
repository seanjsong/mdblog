# markdown blog

This blog app is made catering for my own needs. When it comes to writing blog, maybe you have the same preference as me:

* You can write blog articles in markdown format and save them directly in filesystem, categorized by subdirectories.
* Attachments like images and code snippets can be saved along with the article.
* Article's last modified time is reflected by filesystem stats.
* Full text search is supported.
* You can view all artilce list, view article list by category, or view single article content. Article list can be displayed in infinite scrolling manner.
* All these features are provided by a set of backend API and a single-page app in frontend.

I hope you enjoy it. 

## Installation

This module works as a mounted subapp in a main express app. You can customized the url portion of the mount point. As an example, see <https://github.com/seansoong/songjinshan.com_blog.git>.

Besides `npm install` dependencies, you need install [PhantomJS](http://phantomjs.org/download.html). This is a headless browser running on the server side for SEO. And you also need install [Riak](http://basho.com/resources/downloads/) database and set its port to 8098. When the app starts up, all articles in filesystem will be updated to database to facilitate querying.

## TODO

* lazy load article list
* full text search
* rss feed
* providing download for complete code snippets
