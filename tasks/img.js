var fs = require('fs'),
    path = require('path'),
    which = require('which'),
    exec = require('exec');

var existsSync = fs.existsSync || path.existsSync;

var win32 = process.platform === 'win32';

module.exports = function(grunt) {

    var png = ['.png', '.bmp', '.gif', '.pnm', '.tiff'],
        jpegs = ['.jpg', '.jpeg'];

    var optipng_helper = function(files, opts, output, cb) {
        opts = opts || {};
        cb = cb || function() {};

        which_helper('optipng', function(err, cmdpath) {
            if(err) return not_installed_helper('optipng', cb);

            var args = opts.args ? opts.args : [];
                args = args.concat(files);

            if(!files.length) return cb();

            grunt.log.writeln('Running optipng... ' + grunt.log.wordlist(files));

            if ( output ) {
                args.push('-dir', output, '-clobber');
            }

            var optipng = grunt.util.spawn({
                cmd: cmdpath,
                args: args
            }, function() {});

            optipng.stdout.pipe(process.stdout);
            optipng.stderr.pipe(process.stderr);
            optipng.on('exit', cb);

        });
    };

    var jpegtran_helper = function(files, opts, output, cb) {
        opts = opts || {};
        cb = cb || function() {};
        opts.args = opts.args ? opts.args : ['-copy', 'none', '-optimize','-outfile','jpgtmp.jpg'];

        which_helper('jpegtran', function(err, cmdpath) {
            if(err) return not_installed_helper('jpegtran', cb);
            (function run(file) {
                if(!file) return cb();

                grunt.log.subhead('** Processing: ' + file);
                var jpegtran = grunt.util.spawn({
                    cmd: cmdpath,
                    args: opts.args.concat(file)
                }, function() {});

                var outputPath;
                if (output) {
                    outputPath = output + path.basename(file);
                    try {
                        grunt.file.read(outputPath);
                    } catch(err) {
                        grunt.file.write(outputPath);
                    }
                    grunt.log.writeln('Output file: ' + outputPath);
                } else {
                    outputPath = file;
                }

                jpegtran.stdout.pipe(process.stdout);
                jpegtran.stderr.pipe(process.stderr);

                jpegtran.on('exit', function(code) {
                    if(code) return grunt.warn('jpgtran exited unexpectedly with exit code ' + code + '.', code);

                    // copy the temporary optimized jpg to original file
                    fs.createReadStream('jpgtmp.jpg')
                        .pipe(fs.createWriteStream(outputPath)).on('close', function() {
                            clear_temp_file_helper('jpgtmp.jpg', function() {

                            // rescan jpeg
                            if (fs.existsSync(opts.rescan)) {
                                exec([opts.rescan, outputPath, outputPath], function(err, out, code) {
                                    if (err) {
                                        grunt.log.error(err);
                                    } else {
                                        grunt.log.writeln(out);
                                    }
                                    // output some size info about the file
                                    min_max_stat_helper(outputPath, file);
                                    run(files.shift());
                                });
                            } else {
                                min_max_stat_helper(outputPath, file);
                                run(files.shift());
                            }
                        });
                    });
                });
            }(files.shift()));
        });
    };

    var clear_temp_file_helper = function(tempFile, callback) {
        grunt.util.spawn({
            cmd:'rm',
            args:['-rf',tempFile]
        }, callback);
    };

    // Output some size info about a file, from a stat object.
    var min_max_stat_helper = function(min, max) {
        min = typeof min === 'string' ? fs.statSync(min) : min;
        max = typeof max === 'string' ? fs.statSync(max) : max;
        grunt.log.writeln('Uncompressed size: ' + String(max.size).green + ' bytes.');
        grunt.log.writeln('Compressed size: ' + String(min.size).green + ' bytes minified.');
    };

    var not_installed_helper = function(cmd, cb) {
        grunt.verbose.or.writeln();
        grunt.log.write('Running ' + cmd + '...').error();
        grunt.log.errorlns([
            'In order for this task to work properly, :cmd must be',
            'installed and in the system PATH (if you can run ":cmd" at',
            'the command line, this task should work)'
        ].join(' ').replace(/:cmd/g, cmd));
        grunt.log.subhead('Skiping ' + cmd + ' task');
        if(cb) cb();
    };

    // **which** helper, wrapper to isaacs/which package plus some fallback logic
    // specifically for the win32 binaries in vendor/ (optipng.exe, jpegtran.exe)
    var which_helper = function(cmd, cb) {
        if(!win32 || !/optipng|jpegtran/.test(cmd)) return which(cmd, cb);

        var cmdpath = cmd === 'optipng' ? '../vendor/optipng-0.7.1-win32/optipng.exe' :
          '../vendor/jpegtran-8d/jpegtran.exe';

        cb(null, path.join(__dirname, cmdpath));
    };


    grunt.registerMultiTask('img', 'Optimizes .png/.jpg images using optipng/jpegtran', function() {
        var cb = this.async(),
            source = this.data.src,
            dest = this.data.dest,
            files = [],
            pngConfig = grunt.config('optipng'),
            jpgConfig = grunt.config('jpegtran'),
            recursive =  grunt.config('recursive') || true;

        if( grunt.util.kindOf( source ) === 'string' && path.extname( source ).length === 0 && recursive ) {
            var filesList = [];
            grunt.file.recurse(source,function(abspath){
                if(abspath){
                    filesList.push(abspath);
                }
            });
            files = filesList;
        } else {
            files = grunt.file.expand(source);
        }

        var pngfiles = files.filter(function(file) {
            return !!~png.indexOf(path.extname(file).toLowerCase());
        });

        var jpgfiles = files.filter(function(file) {
            return !!~jpegs.indexOf(path.extname(file).toLowerCase());
        });

        if (dest && !/\/$/.test(dest) ) {
            dest += '/';
        }

        optipng_helper(pngfiles, pngConfig, dest, function(err) {
            if(err) grunt.log.error(err);

            // If optipng create .bak files.
            grunt.file.expand(dest+'/**/*.bak').forEach(function(file) {
                // remove .bak file
                fs.unlinkSync(file);
            });

            jpegtran_helper(jpgfiles, jpgConfig, dest, function(err) {
                if(err) grunt.log.error(err);
                cb();
            });
        });
    });
};
