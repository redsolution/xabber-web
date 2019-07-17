define(["xabber-dependencies"], function (deps) {
    var _ = deps._,
        $ = deps.$,
        hasher = deps.SHA1.b64_sha1;

    var _image_cache = {};

    var COLORS = [
        "#1abc9c", "#16a085", "#f1c40f", "#f39c12",
        "#2ecc71", "#27ae60", "#e67e22", "#d35400",
        "#3498db", "#2980b9", "#e74c3c", "#c0392b",
        "#9b59b6", "#8e44ad", "#bdc3c7", "#34495e",
        "#2c3e50", "#95a5a6", "#7f8c8d", "#ec87bf",
        "#d870ad", "#f69785", "#9ba37e", "#b49255",
        "#a94136"
    ];

    var MAX_SIZE = 256;
    var MAX_IMG_SIZE = 1280;

    var b64toBlob = function (b64Data, contentType, sliceSize) {
        contentType = contentType || '';
        sliceSize = sliceSize || 512;
        var byteCharacters = atob(b64Data);
        var byteArrays = [];
        for (var offset = 0; offset < byteCharacters.length; offset += sliceSize) {
            var slice = byteCharacters.slice(offset, offset + sliceSize);
            var byteNumbers = new Array(slice.length);
            for (var i = 0; i < slice.length; i++) {
                byteNumbers[i] = slice.charCodeAt(i);
            }
            var byteArray = new Uint8Array(byteNumbers);
            byteArrays.push(byteArray);
        }
        var blob = new Blob(byteArrays, {type: contentType});
        return blob;
    };

    var CachedImage = function (image) {
        this.url = window.URL.createObjectURL(b64toBlob(image));
        _image_cache[image] = this;
        return this;
    };

    var getCachedImage = function (image) {
        // save often used image and get blob url for it
        if (image instanceof CachedImage) {
            return image;
        }
        return _image_cache[image] || new CachedImage(image);
    };

    var getDefaultAvatar = function (name) {
        // generate colored avatar with first letters of username
        var canvas = document.createElement('canvas'),
            ctx = canvas.getContext('2d'),
            _name = name ? name.trim() : '',
            first_name, last_name, splitted_name = _name.split(' ', 2),
            first_letter, second_letter;
            // color_index;
        first_name = splitted_name[0];
        last_name = (splitted_name.length > 1 ? splitted_name[1] : '');
        first_letter = first_name[0] || '';
        if (last_name) {
            second_letter = last_name[0];
        } else {
            second_letter = (first_name.length > 1 ? first_name[1] : '');
        }
        // color_index = Math.floor(hasher(_name).charCodeAt(0) % COLORS.length);
        canvas.width = 256;
        canvas.height = 256;
        ctx.rect(0, 0, 256, 256);
        ctx.fillStyle = getAccountColor(name);//COLORS[color_index];
        ctx.fill();
        ctx.font = "bold 100px sans-serif";
        ctx.fillStyle = "#FFF";
        ctx.textAlign = "center";
        ctx.fillText(first_letter.toUpperCase()+second_letter.toUpperCase(), 128, 160);
        var image = canvas.toDataURL().replace(/^data:image\/(png|jpg|jpeg);base64,/, '');
        return image;
    };

    var getAccountColor = function (name) {
        var _name = name ? name.trim() : '',
            color_index = Math.floor(hasher(_name).charCodeAt(0) % COLORS.length);
        return COLORS[color_index];
    };

    var getImageSize = function (size, max_size) {
        if (size.width > size.height) {
            if (size.width > max_size) {
                size.height *= max_size / size.width;
                size.width = max_size;
            }
        } else {
            if (size.height > max_size) {
                size.width *= max_size / size.height;
                size.height = max_size;
            }
        }
        return size;
    };

    var compressImage = function (file) {
        var image_obj = new Image(),
            src = window.URL.createObjectURL(file),
            deferred = new $.Deferred();
        image_obj.onload = function () {
            image_obj.onload = null;
            var canvas = document.createElement('canvas'),
                ctx = canvas.getContext('2d'),
                width = image_obj.naturalWidth,
                height = image_obj.naturalHeight,
                file_type = file.type,
                file_name = file.name,
                new_size = getImageSize({width: width, height: height}, MAX_IMG_SIZE);
            canvas.width = new_size.width;
            canvas.height = new_size.height;
            ctx.drawImage(image_obj, 0, 0, new_size.width, new_size.height);
            canvas.toBlob((blob) => {
                const file = new File([blob], file_name, {
                    type: file_type,
                    lastModified: Date.now()
                });
                deferred.resolve(file);
            }, file_type, 0.8);
            window.URL.revokeObjectURL(src);
        };
        image_obj.onerror = function() {
            image_obj.onerror = null;
            window.URL.revokeObjectURL(src);
            deferred.resolve(false);
        };
        image_obj.src = src;
        return deferred.promise();
    };

    var setCss = function (image_el, cached_image, img_size) {
        var $image_el = $(image_el),
            css = {
                backgroundImage: 'url("' + cached_image.url + '")',
                backgroundSize: 'cover',
                backgroundColor: '#FFF'
            };
        $image_el.css(css);
    };

    var getAvatarFromFile = function (file) {
        var image_obj = new Image(),
             src = window.URL.createObjectURL(file),
             deferred = new $.Deferred();
         image_obj.onload = function () {
             image_obj.onload = null;
             var canvas = document.createElement('canvas'),
                 ctx = canvas.getContext('2d'),
                 width = image_obj.naturalWidth,
                 height = image_obj.naturalHeight,
                 b64_image, hash,
                 new_size = getImageSize({width: width, height: height}, MAX_SIZE);
             canvas.width = new_size.width;
             canvas.height = new_size.height;
             ctx.drawImage(image_obj, 0, 0, canvas.width, canvas.height);
             b64_image = canvas.toDataURL('image/jpeg').replace(/^data:image\/(png|jpg|jpeg);base64,/, '');
             window.URL.revokeObjectURL(src);
             canvas.toBlob((blob) => {
                 var reader = new FileReader();
                 reader.onload = function () {
                     b64_image = reader.result.replace(/^data:image\/(png|jpg|jpeg);base64,/, '');
                     let binary_file = atob(b64_image),
                        bytes = new Uint8Array(binary_file.length);

                     for (let i = 0; i < binary_file.length; i++)
                         bytes[i] = binary_file.charCodeAt(i);

                     hash = sha1(bytes);
                     deferred.resolve(b64_image, hash, binary_file.length);
                 }.bind(this);
                 reader.readAsDataURL(blob);
             }, 'image/jpeg', 0.8);
         };
         image_obj.onerror = function() {
             image_obj.onerror = null;
             window.URL.revokeObjectURL(src);
             deferred.resolve(false, false, false);
         };
         image_obj.src = src;
         return deferred.promise();
    };

    $.fn.setAvatar = function (image, size) {
        var cached_image = getCachedImage(image);
        setCss(this, cached_image, size);
    };

    return {
        getCachedImage: getCachedImage,
        getBlobImage: b64toBlob,
        getDefaultAvatar: getDefaultAvatar,
        getAvatarFromFile: getAvatarFromFile,
        getDefaultColor: getAccountColor,
        compressImage: compressImage
    };
});
