import nacl from 'tweetnacl'
import { machineIdSync } from 'node-machine-id'

import { buffer, typedArray, crypto, keys } from './utils'


export default class {
    /**
     * WARNING: THIS LIBRARY IS UNTESTED AND THEREFORE INSECURE. USE AT YOUR
     * OWN RISK. Seriously. Don't expect any security at all from this.
     *
     * This class implements the no-header-keys, role-select version of
     * Axolotl. This is very similar to the implementation that Whisper Systems
     * uses. The only real caveat is that you have to set the role of each
     * user, where 'alice' is the conversation initiator and 'bob' is the
     * conversation receiver.
     */
    constructor () {
        //console.log("constructor called")
        //experimenting with migrating pbkdf2-sha256 to pbkdf2
        //to use sha512 - scheduled for future work. //bassel
        //var derivedKey = pbkdf2.pbkdf2Sync('password', 'salt', 1, 32, 'sha512')
        //console.log(derivedKey.toString('hex'))
        //will do this once initial bachelor project is done.

        console.log(machineIdSync()) //woot.
        this._deviceid = null

        // Storage function that is set later on.
        this._store = null

        // Internals for the protocol.
        this._rootKey = null
        this._chainKeys = { send: null, recv: null }
        this._identityKeys = { send: null, priv: null, recv: null }
        this._ratchetKeys = { send: null, priv: null, recv: null }
        this._counters = { send: null, recv: null }
        this._prevCounter = null // PNs

        // Determine if we are going to ratchet.
        this._ratchet = null

        this._skippedMessageKeys = []
        this._stagedSkippedMessageKeys = []

        // Am I Alice or Bob in this scenario?
        // roles should be phased out for omemo
        // and should be reduced to sender and reciever
        // to enable a multi party sessioN
        this._role = null
        this._baseKeys = null
        this._theirBaseKey = null
    }

    /**
     * Set the persistent storage function, that will be called each time the
     * converstation state needs to be saved. This function allows one to
     * automatically have conversation state saved so that it can easily be
     * resumed later on.
     *
     * It takes a storageFunc that takes two arguments: the data to be saved, and
     * a callback for when the data is saved. A callback is used because it is
     * 2015 and a callback provides more interop at the moment. This function
     * does convert it to a promise for internal use, however.
     *
     * @param {Function} storageFunc - Function to be called for storing state
     * @return {Object} this - For chaining.
     */
    storage (storageFunc) {
        this._store = (data) => {
            return new Promise((resolve, reject) => {
                storageFunc(data, (err, result) => {
                    if (err) return reject(err)
                    else return resolve(result)
                })
            })
        }

        return this
    }

    /**
     * Serialize our session to a simple object of strings, integers, and arrays
     * so that it can easily be saved to disk.
     *
     * @return {Object} s - Object that can be used to resume a session.
     */
    serialize () {
        /**
         * One thing to keep in mind is to not accidentally mutate these values
         * outside of this function, which is why I've listed the type above them
         * (so that extra precautions are taken to clone things that are mutable)
         */
        let s = {
            // Buffers.
            rootKey: this._rootKey.toString('hex'),
            chainKeys: Object.assign({}, this._chainKeys),

            // Typed arrays.
            identityKeys: Object.assign({}, this._identityKeys),
            ratchetKeys: Object.assign({}, this._ratchetKeys),

            // Integers.
            counters: this._counters,
            prevCounter: this._prevCounter,
            role: this._role,

            // Booleans.
            ratchet: this._ratchet,

            // Array (of hexdecimal strings.)
            skippedMessageKeys: this._skippedMessageKeys.slice(0)
        }

        /**
         * Once we've got our "safe" object (aka one that we can mutate without
         * side effects), go through each property and convert them to their
         * respective Base64 (if TypedArray) or hex (if Buffer) representation.
         */
        if (s.chainKeys.send !== null) {
            s.chainKeys.send = s.chainKeys.send.toString('hex')
        }

        if (s.chainKeys.recv !== null) {
            s.chainKeys.recv = s.chainKeys.recv.toString('hex')
        }

        /**
         * This is just a concise way of going through all of the possible
         * Uint8Array values and converting them to their Base64 equivalents.
         */
        ['identityKeys', 'ratchetKeys'].forEach(keySet => {
            ['send', 'priv', 'recv'].forEach(keyType => {
                // As long as the value isn't null, convert it to Base64
                if (s[keySet][keyType] !== null) {
                    s[keySet][keyType] = typedArray.toBase64(
                        s[keySet][keyType]
                    )
                }
            })
        })

        return s
    }

    /**
     * Resume a session from a serialized session object.
     *
     * @param {Object} s - Result of calling the serialize() function.
     * @return {Object} this
     */
    resume (s) {
        // Set the root key.
        this._rootKey = new Buffer(s.rootKey, 'hex')

        // Convert hex values back to their buffer equivalents.
        if (s.chainKeys.send !== null) {
            this._chainKeys.send = new Buffer(s.chainKeys.send, 'hex')
        }

        if (s.chainKeys.recv !== null) {
            this._chainKeys.recv = new Buffer(s.chainKeys.recv, 'hex')
        }

        /**
         * Go through the potential Base64 values and convert them back to their
         * Uint8Array representations.
         */
        ['identityKeys', 'ratchetKeys'].forEach(keySet => {
            ['send', 'priv', 'recv'].forEach(keyType => {
                if (s[keySet][keyType] !== null) {
                    this['_' + keySet][keyType] = nacl.util.decodeBase64(
                        s[keySet][keyType]
                    )
                }
            })
        })

        // Assign things that don't need to be unserialized.
        this._counters = s.counters
        this._prevCounter = s.prevCounter
        this._role = s.role
        this._ratchet = s.ratchet
        this._skippedMessageKeys = s.skippedMessageKeys

        return this
    }

    /**
     * Set our identity keys. These are our long-lived keys that ensure we are
     * who we say we are throughout all future Axolotl sessions.
     *
     * @param {Object} keypair - NaCl-generated key pair.
     * @return {Object} this - This object (for chaining.)
     */
    identity (keypair) {
        if (!(
            keypair.hasOwnProperty('publicKey') &&
            keypair.hasOwnProperty('secretKey') &&
            keypair.publicKey instanceof Uint8Array &&
            keypair.secretKey instanceof Uint8Array
        )) {
            throw new Error('identityKeys: invalid key pair')
        }

        this._identityKeys.send = keypair.publicKey
        this._identityKeys.priv = keypair.secretKey
        return this
    }

    /**
     * Set our own base key. If we are the initiator (Alice), we can pick
     * anything we'd like here, because we have the luxury of telling Bob which
     * keys he's going to use to communicate with us. If we are Bob, we must pick
     * the key that corresponds to the public pre-key Alice chose (otherwise, we
     * would not be able to decrypt anything she sends us!)
     *
     * @param {Object} keypair - NaCl-generated key pair.
     * @return {Object} this - This object (for chaining.)
     */
    handshake (keypair) {
        if (!(
            keypair.hasOwnProperty('publicKey') &&
            keypair.hasOwnProperty('secretKey') &&
            keypair.publicKey instanceof Uint8Array &&
            keypair.secretKey instanceof Uint8Array
        )) {
            throw new Error('baseKeys: invalid key pair')
        }

        this._baseKeys = keypair
        return this
    }

    /**
     * Set the other party's base key, e.g. the key that was either received from
     * from a pre-key message or pulled from a list of pre-keys on the server.
     *
     * @param {Uint8Array} publicKey - a NaCl-generated public key.
     * @return {Object} this - This object (for chaining.)
     */
    theirHandshake (publicKey) {
        if (!publicKey instanceof Uint8Array) {
            throw new Error('theirBaseKey: Expected Uint8Array for publicKey')
        }

        this._theirBaseKey = publicKey
        return this
    }

    /**
     * Set our role. 'alice' is the initiatior, 'bob' is the receiver. Note that
     * 'alice' can also be substituted with 'initiatior'.
     *
     * @param {String} role - accepts 'alice', 'initiator', 'bob', 'receiver'
     * @return {Object} this - This object (for chaining.)
     */
    setRole (role) {
        if (role === 'alice' || role === 'initiator') this._role = 1
        else if (role === 'bob' || role === 'receiver') this._role = 2
        else throw new Error(`setRole: Unexpected role assigned: ${role}`)
        return this
    }

    /**
     * Set the other party's identity key.
     *
     * @param {Uint8Array} publicKey - a NaCl-generated public key.
     * @return {Object} this - This object (for chaining.)
     */
    theirIdentity (publicKey) {
        if (!publicKey instanceof Uint8Array) {
            throw new Error('theirIdentityKey: Expected Uint8Array')
        }

        this._identityKeys.recv = publicKey
        return this
    }

    /**
     * Compute a shared master key, and subsequent shared chain keys and root
     * keys.
     *
     * @param {TypedArray} publicKey - a NaCl-generated public key.
     * @return {Promise}
     */
    computeMasterKey () {
        // Role must be assigned before we can compute a master key.
        if (!this._role) {
            throw new Error('computeMasterKey: Role must be assigned first!')
        }

        let keys = null

        // Role is important to how our master key is computed.
        if (this._role === 1) {
            /**
             * We are Alice in this scenario. That means that our master
             * key computation looks like:
             *
             * ECDHE(theirBase, ourIdentity)
             * ECDHE(theirIdentity, ourBase)
             * ECDHE(theirBase, ourBase)
             */
            keys = [
                crypto.dh(this._theirBaseKey, this._identityKeys.priv),
                crypto.dh(this._identityKeys.recv, this._baseKeys.secretKey),
                crypto.dh(this._theirBaseKey, this._baseKeys.secretKey)
            ]
        } else {
            /**
             * We are Bob in this scenario. That means that our master
             * key computation looks like:
             *
             * ECDHE(theirIdentity, ourBase)
             * ECDHE(theirBase, ourIdentity)
             * ECDHE(theirBase, ourBase)
             */
            keys = [
                crypto.dh(this._identityKeys.recv, this._baseKeys.secretKey),
                crypto.dh(this._theirBaseKey, this._identityKeys.priv),
                crypto.dh(this._theirBaseKey, this._baseKeys.secretKey)
            ]
        }

        /**
         * We need to concatenate the three keys, and the easiest way to do this
         * is to convert them to buffers, then concatenate the buffers.
         */
        const masterKeyMaterial = Buffer.concat(
            keys.map(key => typedArray.toBuffer(key))
        )

        // Create a master key that is 64 bytes long.
        const masterKey = crypto.kdf(masterKeyMaterial, '', 100, 64)

        // The root key is the first 32 bytes of the master key.
        this._rootKey = masterKey.slice(0, 32)

        // Initialize all of the message counters to zero.
        this._counters.send = 0
        this._counters.recv = 0
        this._prevCounter = 0

        if (this._role === 1) {
            /**
             * We are Alice.
             *
             * The reception chain key is the second 32 bytes of the master key.
             * This will be the chain key that Bob uses to send, hence why it's
             * our recv key.
             */
            this._chainKeys.recv = masterKey.slice(32)
            this._ratchetKeys.send = null
            this._ratchetKeys.priv = null
            this._ratchetKeys.recv = this._theirBaseKey

            // We are going to ratchet.
            this._ratchet = true
        } else {
            // Alice will have her receive key set to our send key.
            this._chainKeys.send = masterKey.slice(32)

            /**
             * We need to set our ratchet send keys to our base keys, since those
             * will correspond to the initial message Alice sends us as she will
             * have used our pre-key (which is our base keys public key!)
             */
            this._ratchetKeys.send = this._baseKeys.publicKey
            this._ratchetKeys.priv = this._baseKeys.secretKey

            /**
             * We won't have received a message from Alice yet (I mean, we might
             * have, but this is the session setup so it doesn't matter yet) so
             * set our ratchet receive key to null.
             */
            this._ratchetKeys.recv = null

            // And since we are Bob, we are not going to ratchet yet.
            this._ratchet = false
        }

        return new Promise((resolve, reject) => {
            if (!this._store) return resolve()

            this._store(this.serialize())
                .then(() => resolve())
                .catch(e => reject(e))
        })
    }

    /**
     * Encrypt a message.
     *
     * @param {String} cleartext - The message to be encrypted.
     * @return {Promise}
     */
    encrypt (cleartext) {
        if (this._ratchet === true) {
            // Generate new sending key pair.
            const newKeys = keys.newPair()

            // The new keys are our new ratchet *sending* pair.
            this._ratchetKeys.send = newKeys.publicKey
            this._ratchetKeys.priv = newKeys.secretKey

            /**
             * Derive a new root key and chain key using our newly generated
             * secret ratchet key and their ratchet public key. This is done by
             * taking the result of a KDF on the DH result of their ratchet
             * public key and our new private ratchet key.
             */
            const newKeyMaterial = crypto.kdf(
                typedArray.toBuffer(
                    crypto.dh(
                        this._ratchetKeys.recv,
                        this._ratchetKeys.priv
                    )
                ), this._rootKey, 100, 64
            )

            /**
             * Just like in the session setup, the root key is the first 32
             * bytes of the new key material, and the sending chain key is the
             * second 32 bytes.
             */
            this._rootKey = newKeyMaterial.slice(0, 32)
            this._chainKeys.send = newKeyMaterial.slice(32)

            /**
             * Since we have ratcheted, set the previous counter to the number of
             * messages that we sent on this chain, then reset this chain's
             * counter.
             */
            this._prevCounter = this._counters.send
            this._counters.send = 0

            // And, we're done ratcheting.
            this._ratchet = false
        }

        return new Promise((resolve, reject) => {
            /**
             * For the message key, take the HMAC of the sending chain key with 0
             * as the data.
             */
            const messageKey = crypto.hmac(this._chainKeys.send, '0')
            const nonce = nacl.randomBytes(nacl.secretbox.nonceLength)
            const ciphertext = nacl.secretbox(
                nacl.util.decodeUTF8(cleartext),
                nonce,
                buffer.toTypedArray(messageKey)
            )

            const message = {
                ephemeralKey: typedArray.toBase64(this._ratchetKeys.send),
                counter: this._counters.send,
                previousCounter: this._prevCounter,
                ciphertext: typedArray.toBase64(ciphertext),
                nonce: typedArray.toBase64(nonce)
            }

            /**
             * Update the sent counter. (because we're sending a message right
             * now)
             */
            this._counters.send = this._counters.send + 1

            // Advance the chain key.
            this._chainKeys.send = crypto.hmac(this._chainKeys.send, '1')

            // And finally, give the user their encrypted message.
            if (!this._store) return resolve(message)

            this._store(this.serialize())
                .then(() => resolve(message))
                .catch(e => reject(e))
        })
    }

    /**
     * Decrypt a message object.
     *
     * @param {Object} message - The message object to be decrypted.
     * @param {String} message.ephemeralKey - Base64 ephemeral key
     * @param {Number} message.counter - Number of messages sent on this chain
     * @param {Number} message.previousCounter - Number of messages on prev chain
     * @param {String} message.ciphertext - Base64 ciphertext to be decrypted
     * @param {String} message.nonce - Base64 nonce for ciphertext
     * @return {Promise}
     */
    decrypt (message) {
        return new Promise((resolve, reject) => {
            if (!(
                message &&
                message.hasOwnProperty('ephemeralKey') &&
                message.hasOwnProperty('counter') &&
                message.hasOwnProperty('previousCounter') &&
                message.hasOwnProperty('ciphertext') &&
                message.hasOwnProperty('nonce') &&
                message.ephemeralKey.length === 44 &&
                message.nonce.length === 32 &&
                message.ciphertext.length > 0 &&
                !isNaN(message.counter) &&
                !isNaN(message.previousCounter)
            )) {
                return reject(new Error('decrypt: Message object invalid.'))
            }

            const messageCounter = message.counter
            let decryptedMessage
            let pChainKey

            /**
             * Before we try anything, we need to see if we can decrypt this
             * message with a key that corresponds to a skipped message (e.g. a
             * message we didn't receive)
             */
            for (var i = 0; i < this._skippedMessageKeys.length; i++) {
                /**
                 * Get the current index out of the skipped message keys, and
                 * convert it from hex back to a buffer.
                 */
                const thisKey = new Buffer(this._skippedMessageKeys[i], 'hex')

                // Attempt to decrypt the message.
                decryptedMessage = nacl.secretbox.open(
                    nacl.util.decodeBase64(message.ciphertext),
                    nacl.util.decodeBase64(message.nonce),
                    buffer.toTypedArray(thisKey)
                )

                const cleartext = nacl.util.encodeUTF8(decryptedMessage)

                /**
                 * If the message is successfully decrypted with one of these
                 * keys, then we've received an out-of-order message.
                 */
                if (decryptedMessage !== false) {
                    /**
                     * Remove the key we used to decrypt this message from
                     * storage, since we should under no circumstances need it
                     * again.
                     */
                    this.consumeMessageKey(i)

                    if (!this._store) {
                        return resolve({ cleartext, outOfOrder: true })
                    }

                    return this._store(this.serialize())
                        .then(() => resolve({
                            cleartext, outOfOrder: true
                        }))
                        .catch(e => reject(e))
                }
            }

            /*
             * If we do not have a receiving ratchet key set OR if this message
             * contains an ephemeral key that isn't the same as our current
             * receiving ratchet key, we are about to ratchet.
             */
            if (
                (this._ratchetKeys.recv === null) ||
                (nacl.util.encodeBase64(this._ratchetKeys.recv) !==
                    message.ephemeralKey)
            ) {
                if (this._ratchet === true) {
                    /**
                     * We are already ratcheting, this message is undecryptable
                     * because we already threw away our keys.
                     */
                    throw new Error('Undecryptable message, ratchet broken.')
                }

                /**
                 * Set the purported previous counter, and the purported next
                 * ratchet receive key.
                 */
                let pPrevCounter = message.previousCounter
                let pRatchetRecv = nacl.util.decodeBase64(message.ephemeralKey)

                /**
                 * The spec says to stage all of the keys for the previous
                 * counter to the current counter. This is because if we missed
                 * some messages from the last chain, the previous counter value
                 * will be the last message sent on the last chain, and the
                 * current counter will be the last message we received on the
                 * last chain, since we will have not changed chains just yet.
                 *
                 * Note that we do not need to save the message key generated
                 * here to use in this iteration, because the message we have
                 * received WILL be on the new chain, making this message key
                 * irrelevant.
                 */
                this.stageSkippedMessageKeys(
                    this._counters.recv,
                    pPrevCounter,
                    this._chainKeys.recv
                )

                /**
                 * We are going to be on a new root thanks to this new key, so we
                 * need to calculate the new chain key and root key.
                 */
                let newKeyMaterial = crypto.kdf( typedArray.toBuffer(crypto.dh(pRatchetRecv, this._ratchetKeys.priv)), this._rootKey, 100, 64)

                // Hold on to the new purported keys.
                let pRootKey = newKeyMaterial.slice(0, 32)
                pChainKey = newKeyMaterial.slice(32)

                /**
                 * Calculate all of the keys from the start of this chain to the
                 * counter of the message we just received.
                 */
                let stagedKeys = this.stageSkippedMessageKeys(
                    0, messageCounter, pChainKey
                )

                /**
                 * This is the last key generated by stageSkippedNessageKeys,
                 * which should be for the message we just received.
                 */
                let messageKey = stagedKeys.messageKey

                /**
                 * pChainKey will already be defined, because it was just set
                 * from  the key material above, and then used in the staged key
                 * calculation.
                 */
                pChainKey = stagedKeys.chainKey

                // Attempt to decrypt the message.
                decryptedMessage = nacl.secretbox.open(
                    nacl.util.decodeBase64(message.ciphertext),
                    nacl.util.decodeBase64(message.nonce),
                    buffer.toTypedArray(messageKey)
                )

                /**
                 * If the message fails to decrypt at this point, it will be
                 * because we ratcheted and didn't have a record of the previous
                 * keys. Or, the message was corrupt.
                 */
                if (decryptedMessage === false) {
                    /**
                     * Remove all of the keys we staged during this decryption
                     * attempt.
                     */
                    this.cleanStagedKeys()
                    return reject(new Error('Undecryptable message.'))
                }

                // If it didn't fail to decrypt, move the ratchet forward.
                this._rootKey = pRootKey
                this._ratchetKeys.recv = pRatchetRecv

                // Clear out our private material.
                this._ratchetKeys.send = null
                this._ratchetKeys.priv = null

                // We're going to ratchet next time around.
                this._ratchet = true
            } else {
                /*
                 * There is no new ephemeral key, which means that we are going
                 * to continue down the current chain.
                 *
                 * Stage all keys from the last received to the message counter.
                 */
                let stagedKeys = this.stageSkippedMessageKeys(
                    this._counters.recv,
                    messageCounter,
                    this._chainKeys.recv
                )

                /**
                 * Get the message key and new chain key from the last staged key
                 * (which should match the message we just received)
                 */
                let messageKey = stagedKeys.messageKey

                pChainKey = stagedKeys.chainKey

                decryptedMessage = nacl.secretbox.open(
                    nacl.util.decodeBase64(message.ciphertext),
                    nacl.util.decodeBase64(message.nonce),
                    buffer.toTypedArray(messageKey)
                )

                /**
                 * If we fail to decrypt here, it is because the message itself
                 * was invalid.
                 */
                if (decryptedMessage === false) {
                    this.cleanStagedKeys()
                    return reject(new Error('Undecryptable message.'))
                }
            }

            /**
             * Okay, if we made it this far, we've got a decrypted message ready
             * to be returned. Commit all of the keys we've staged up until this
             * point, as they may be needed to decrypt messages received later
             * on.
             */
            this.commitStagedKeys()

            // Update the received counter.
            this._counters.recv = messageCounter + 1

            /**
             * Update the recv chain key to the one that was purported
             * earlier on.
             */
            this._chainKeys.recv = pChainKey

            /**
             * decryptedMessage is still in buffer format, we need to get it
             * in UTF8 so that it's actually readable.
             */
            const cleartext = nacl.util.encodeUTF8(decryptedMessage)

            // And finally, give the user their encrypted message.
            if (!this._store) return resolve({ cleartext })

            this._store(this.serialize())
                .then(() => resolve({ cleartext }))
                .catch(e => reject(e))
        })
    }

    /**
     * Stage all possible message keys from a set start point to a set end point.
     *
     * @param {Number} lCounterRecv - Message number in the chain to start with
     * @param {Number} lMessageCounter -  Message number in the chain to end with
     * @param {String} lChainKeyRecv - The chain key to compute message keys for
     * @return {Object} keys - An object with the last message key and chain key
     */
    stageSkippedMessageKeys (lCounterRecv, lMessageCounter, lChainKeyRecv) {
        if (!Buffer.isBuffer(lChainKeyRecv)) {
            // If the chain key isn't a buffer, just do nothing.
            return
        }

        let chainKey = lChainKeyRecv

        /**
         * If the root key is still the same, then we are advancing the chain
         * right off the bat. Otherwise, we are going to use the new chain key
         * we just derived from the master key.
         */
        if (lCounterRecv !== 0) chainKey = crypto.hmac(chainKey, '1')

        /**
         * Run the first calculation outside the loop, because we might be on the
         * first chain.
         */
        let messageKey = crypto.hmac(chainKey, '0')

        // Stage the key we just calculated.
        this.stageKey(messageKey)

        // Now, calculate all of the possible iterations.
        for (
            var currentMessage = lCounterRecv;
            currentMessage < lMessageCounter;
            currentMessage++
        ) {
            chainKey = crypto.hmac(chainKey, '1')
            messageKey = crypto.hmac(chainKey, '0')
            this.stageKey(messageKey)
        }

        /**
         * Remove the last element of the staged keys, since it's going to be the
         * one we return from this function (it will be used immediately) and we
         * don't want used keys clogging the skipped keys storage.
         */
        this._stagedSkippedMessageKeys.pop()

        return { messageKey, chainKey }
    }

    /**
     * Add a key to the staging area (just an in-memory array, persistence is not
     * required here).
     *
     * @param {Buffer|String} key
     */
    stageKey (key) {
        let stagedKey = key

        // If the message key is a buffer, convert it to hex for storage.
        if (Buffer.isBuffer(stagedKey)) {
            stagedKey = stagedKey.toString('hex')
        }

        this._stagedSkippedMessageKeys.push(stagedKey)
        return
    }

    /**
     * Clear the key staging area.
     */
    cleanStagedKeys () {
        this._stagedSkippedMessageKeys = []
        return
    }

    /**
     * Commit all of the staged keys to permanent storage.
     */
    commitStagedKeys () {
        this._skippedMessageKeys = this._skippedMessageKeys.concat(
            this._stagedSkippedMessageKeys
        )
        return
    }

    /**
     * Remove a used key from the key storage.
     *
     * @param {Number} keyIndex - the index of the key to be removed
     * @return {Promise}
     */
    consumeMessageKey (keyIndex) {
        this._skippedMessageKeys.splice(keyIndex, 1)
        return
    }
}
