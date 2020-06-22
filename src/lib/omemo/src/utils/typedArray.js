import nacl from 'tweetnacl'

export default new class {
    /**
    * Take a Uint8Array and convert it to a buffer. Thanks to Martin Thomson:
    * http://stackoverflow.com/a/12101012
    *
    * @param {Uint8Array} ab - The Uint8Array to be converted.
    * @return {Buffer} buffer - The new Buffer.
    */
    toBuffer (ab) {
        var buffer = new Buffer(ab.byteLength)
        var view = new Uint8Array(ab)

        for (var i = 0; i < buffer.length; ++i) {
            buffer[i] = view[i]
        }

        return buffer
    }

    /**
    * Take a typed array and convert it to a base 64 representation.
    *
    * @param {Uint8Array} ab - The Uint8Array to be converted.
    * @return {String} - Base64 representation of the array.
    */
    toBase64 (ab) {
        return nacl.util.encodeBase64(ab)
    }
}
