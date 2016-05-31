module.exports = function (grunt) {

    var gruntConfig =
        {
            pkg: grunt.file.readJSON('package.json'),
            uglify:
                {
                    build:
                        {
                            src: '<%= pkg.name %>.js',
                            dest: '<%= pkg.name %>.min.js'
                        }
                }
        };
    // Project configuration.
    grunt.initConfig(gruntConfig);

    // Load the plugin that provides the "uglify" task.
    grunt.loadNpmTasks('grunt-contrib-uglify');

    // Default task(s).
    grunt.registerTask('default', ['uglify']);
};