/* eslint-disable no-undef,no-unused-vars */
import should from 'should'
import 'should-promised'
import nacl from 'tweetnacl'
import Ratchet from '../src/index.js'

describe('Session', () => {
    // IMPORTANT: These keys are used nowhere other than these tests.
    var aki = {
        publicKey: new Uint8Array(
            [120, 127, 136, 242, 254, 206, 214, 30, 208, 250, 214, 155, 191, 61,
             89, 102, 56, 245, 6, 134, 80, 248, 177, 127, 27, 42, 87, 236, 96,
             21, 25, 70]
        ),

        secretKey: new Uint8Array([191, 178, 223, 214, 75, 12, 77, 69, 78, 226,
            64, 144, 144, 236, 189, 248, 58, 7, 135, 177, 123, 235, 28, 19, 99,
            81, 43, 137, 182, 249, 177, 129]
        )
    }

    var akh = {
        publicKey: new Uint8Array([72, 21, 11, 199, 48, 32, 162, 102, 160, 224,
            156, 102, 95, 131, 14, 160, 171, 130, 37, 150, 179, 112, 237, 246,
            189, 59, 7, 118, 82, 185, 194, 9]
        ),

        secretKey: new Uint8Array([193, 194, 69, 224, 177, 40, 37, 25, 20, 203,
            200, 18, 212, 167, 42, 205, 152, 46, 235, 252, 50, 59, 200, 221,
            136, 152, 31, 32, 224, 36, 12, 81]
        )
    }

    var bki = {
        publicKey: new Uint8Array([135, 231, 129, 182, 192, 66, 50, 60, 173, 84,
            224, 183, 86, 101, 124, 18, 138, 73, 208, 230, 162, 161, 116, 122,
            201, 108, 45, 116, 255, 214, 122, 91]
        ),

        secretKey: new Uint8Array([133, 165, 197, 75, 254, 192, 121, 55, 67, 66,
            214, 152, 168, 141, 239, 38, 125, 235, 124, 173, 236, 203, 85, 105,
            86, 47, 86, 244, 198, 141, 201, 25]
        )
    }

    var bkh = {
        publicKey: new Uint8Array([91, 221, 234, 40, 144, 246, 91, 187, 154, 76,
            60, 178, 204, 81, 35, 195, 254, 114, 246, 88, 90, 170, 68, 97, 199,
            170, 72, 36, 107, 66, 206, 9]
        ),

        secretKey: new Uint8Array([64, 68, 196, 103, 210, 179, 166, 40, 187,
            150, 167, 233, 144, 206, 64, 26, 77, 133, 70, 238, 232, 227, 133,
            83, 149, 202, 213, 41, 152, 243, 237, 41]
        )
    }

    const checkMessage = function (message) {
//        console.log("the message is: " + message) //gives Object
        message.should.be.an.Object
        message.should.have.property('ephemeralKey')
        message.should.have.property('counter')
        message.should.have.property('previousCounter')
        message.should.have.property('ciphertext')
        message.should.have.property('nonce')
    }

    describe('perfect-scenario messaging', () => {
        let aSession = new Ratchet()
        let bSession = new Ratchet()

        aSession.storage((data, callback) => {
            console.log("storage rep: ")
            console.log(data)
            callback()
        })

        aSession
            .identity(aki)
            .handshake(akh)
            .theirIdentity(bki.publicKey)
            .theirHandshake(bkh.publicKey)
            .setRole('initiator')
            .computeMasterKey()

        /**
        * For Bob's session, we need to assume he will have received a
        * pre-key message, containing alice's chosen base public key (he should
        * already have her identity key!). This will allow him to decrypt her
        * first message.
        */
        bSession
            .identity(bki)
            .handshake(bkh)
            .theirIdentity(aki.publicKey)
            .theirHandshake(akh.publicKey)
            .setRole('receiver')
            .computeMasterKey()

        let aMsg = []
        let bMsg = []

        it('alice messages bob', () => {
            return aSession.encrypt('This is the first message!').then(result => {
                checkMessage(result)
                console.log("alice messages bob, line 105: ")
                console.log(result)
                aMsg[0] = result
            })
        })

        it('alice messages bob again, without hearing from bob', () => {
            return aSession.encrypt('This is the second message!').then(result => {
                checkMessage(result)
                aMsg[1] = result
            })
        })

        it('bob decrypts the first message from alice', () => {
            return bSession.decrypt(aMsg[0]).then(result => {
                result.cleartext.should.equal('This is the first message!')
            })
        })

        it('bob decrypts the second message from alice', () => {
            return bSession.decrypt(aMsg[1]).then(result => {
                result.cleartext.should.equal('This is the second message!')
            })
        })

        it('bob responds to alice\'s message', () => {
            return bSession.encrypt('Hello Alice').then(result => {
                checkMessage(result)
                bMsg[0] = result
            })
        })

        it('alice reads the response from bob', () => {
            return aSession.decrypt(bMsg[0]).then(result => {
                result.cleartext.should.equal('Hello Alice')
            })
        })

        it('alice responds to bob\'s message', () => {
            return aSession.encrypt('Hello Bob, how is it going today?').then(result => {
                checkMessage(result)
                aMsg[2] = result
            })
        })

        it('before getting alice\'s reponse, bob sends another message', () => {
            return bSession.encrypt('How are you doing?').then(result => {
                checkMessage(result)
                bMsg[1] = result
            })
        })

        it('alice decrypts bob\'s response, he still hasn\'t gotten her message', () => {
            return aSession.decrypt(bMsg[1]).then(result => {
                result.cleartext.should.equal('How are you doing?')
            })
        })

        it('bob finally decrypts the third message from alice', () => {
            return bSession.decrypt(aMsg[2]).then(result => {
                result.cleartext.should.equal('Hello Bob, how is it going today?')
            })
        })

        it('bob responds to alice\'s third message', () => {
            return bSession.encrypt('It is going great, thanks!').then(result => {
                checkMessage(result)
                bMsg[2] = result
            })
        })

        it('alice reads the last message from bob', () => {
            return aSession.decrypt(bMsg[2]).then(result => {
                result.cleartext.should.equal('It is going great, thanks!')
            })
        })
    })

    describe('messaging with delayed messages', () => {
        let aSession = new Ratchet()
        let bSession = new Ratchet()

        aSession.storage((data, callback) => {
             console.log("alice, 187: ")
             console.log(data)
            callback()
        })

        aSession
            .identity(aki)
            .handshake(akh)
            .theirIdentity(bki.publicKey)
            .theirHandshake(bkh.publicKey)
            .setRole('initiator')
            .computeMasterKey()

        bSession
            .identity(bki)
            .handshake(bkh)
            .theirIdentity(aki.publicKey)
            .theirHandshake(akh.publicKey)
            .setRole('receiver')
            .computeMasterKey()

        let aMsg = []
        let bMsg = []

        it('alice messages bob', () => {
            return aSession.encrypt('This is the first message!').then(result => {
                checkMessage(result)
                aMsg[0] = result
            })
        })

        it('without waiting for bob\'s response, alice sends another message', () => {
            return aSession.encrypt('This is the second message!').then(result => {
                checkMessage(result)
                aMsg[1] = result
            })
        })

        it('bob decrypts the second message from alice first', () => {
            return bSession.decrypt(aMsg[1]).then(result => {
                result.cleartext.should.equal('This is the second message!')
            })
        })

        it('bob then decrypts the first message from alice, and gets warned that it was delivered out of order', () => {
            return bSession.decrypt(aMsg[0]).then(result => {
                result.cleartext.should.equal('This is the first message!')
                result.outOfOrder.should.equal(true)
            })
        })

        it('bob responds to alice\'s message', () => {
            return bSession.encrypt('Hello Alice').then(result => {
                checkMessage(result)
            })
        })
    })

    describe('messaging with delayed messages on a different chain', () => {
        let aSession = new Ratchet()
        let bSession = new Ratchet()

        aSession
            .identity(aki)
            .handshake(akh)
            .theirIdentity(bki.publicKey)
            .theirHandshake(bkh.publicKey)
            .setRole('initiator')
            .computeMasterKey()

        bSession
            .identity(bki)
            .handshake(bkh)
            .theirIdentity(aki.publicKey)
            .theirHandshake(akh.publicKey)
            .setRole('receiver')
            .computeMasterKey()

        let aMsg = []
        let bMsg = []

        it('alice sends bob two messages', () => {
            return aSession.encrypt('This is the first message!').then(result => {
                aMsg[0] = result
                return aSession.encrypt('This is the second message!').then(result => {
                    aMsg[1] = result
                })
            })
        })

        it('bob decrypts the first message from alice, but not the second', () => {
            return bSession.decrypt(aMsg[0]).then(result => {
                result.cleartext.should.equal('This is the first message!')
            })
        })

        it('bob responds to alice\'s message', () => {
            return bSession.encrypt('Hello Alice').then(result => {
                checkMessage(result)
                bMsg[0] = result
            })
        })

        it('alice decrypts bob\'s message and responds', () => {
            return aSession.decrypt(bMsg[0]).then(result => {
                result.cleartext.should.equal('Hello Alice')
                return aSession.encrypt('Hello Bob, how is it going today?').then(result => {
                    aMsg[2] = result
                })
            })
        })

        it('bob decrypts the third message from alice', () => {
            return bSession.decrypt(aMsg[2]).then(result => {
                result.cleartext.should.equal('Hello Bob, how is it going today?')
            })
        })

        it('bob then decrypts the second message from alice, which is on the first chain, and gets warned that it was delivered out of order', () => {
            return bSession.decrypt(aMsg[1]).then(result => {
                result.cleartext.should.equal('This is the second message!')
                result.outOfOrder.should.equal(true)
            })
        })
    })

    describe('protocol errors: incorrect counters', () => {
        let aSession = new Ratchet()
        let bSession = new Ratchet()

        aSession
            .identity(aki)
            .handshake(akh)
            .theirIdentity(bki.publicKey)
            .theirHandshake(bkh.publicKey)
            .setRole('initiator')
            .computeMasterKey()

        bSession
            .identity(bki)
            .handshake(bkh)
            .theirIdentity(aki.publicKey)
            .theirHandshake(akh.publicKey)
            .setRole('receiver')
            .computeMasterKey()

        let aMsg = []
        let bMsg = []

        it('alice messages bob, but the counter is set to something huge', () => {
            return aSession.encrypt('This is the first message!').then(result => {
                result.counter = 200
                checkMessage(result)
                aMsg[0] = result
            })
        })

        it('bob attempts to decrypt the message with the incorrect counter and fails', () => {
            return bSession.decrypt(aMsg[0]).should.be.rejectedWith({ message: 'Undecryptable message.' })
        })

        it('alice encrypts another message, this time with the correct counter, and bob decrypts it', () => {
            return aSession.encrypt('This is the second message!').then(result => {
                return bSession.decrypt(result).then(result => {
                    result.cleartext.should.equal('This is the second message!')
                })
            })
        })
    })

    describe('session resuming', () => {
        let aSession = new Ratchet()
        let bSession = new Ratchet()
        let aSavedSession = null
        let bSavedSession = null

        aSession
            .storage((data, callback) => {
                aSavedSession = data
                callback()
            })
            .identity(aki)
            .handshake(akh)
            .theirIdentity(bki.publicKey)
            .theirHandshake(bkh.publicKey)
            .setRole('initiator')
            .computeMasterKey()

        bSession
            .storage((data, callback) => {
                bSavedSession = data
                callback()
            })
            .identity(bki)
            .handshake(bkh)
            .theirIdentity(aki.publicKey)
            .theirHandshake(akh.publicKey)
            .setRole('receiver')
            .computeMasterKey()

        let aMsg = []
        let bMsg = []

        it('alice sends bob a message', () => {
            return aSession.encrypt('This is the first message!').then(result => {
                checkMessage(result)
                aMsg[0] = result

                // Remove the session object.
                aSession = null
            })
        })

        it('alice deletes her session', () => {
            should.not.exist(aSession)
        })

        it('bob sends alice a message', () => {
            return bSession.encrypt('Message from Bob').then(result => {
                bMsg[0] = result
                checkMessage(result)
            })
        })

        it('alice resumes her session and decrypts bob\'s message', () => {
            aSession = new Ratchet().resume(aSavedSession)

            return aSession.decrypt(bMsg[0]).then(result => {
                result.cleartext.should.equal('Message from Bob')
            })
        })

        it('bob decrypts alice\'s first message', () => {
            return bSession.decrypt(aMsg[0]).then(result => {
                result.cleartext.should.equal('This is the first message!')
            })
        })

        it('alice sends bob another message', () => {
            return aSession.encrypt('This is another message').then(result => {
                checkMessage(result)
                aMsg[1] = result
            })
        })

        it('bob removes his session', () => {
            bSession = null
            should.not.exist(bSession)
        })

        it('bob restores his session and sends a message immediately', () => {
            bSession = new Ratchet().resume(bSavedSession)
            return bSession.encrypt('Another Bob message').then(result => {
                checkMessage(result)
                bMsg[1] = result
            })
        })

        it('bob also decrypts alice\'s message', () => {
            return bSession.decrypt(aMsg[1]).then(result => {
                result.cleartext.should.equal('This is another message')
            })
        })
    })
})
