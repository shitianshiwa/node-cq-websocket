const $WebSocket = require('websocket').w3cwebsocket
const shortid = require('shortid')
const $get = require('lodash.get')
const $CQEventBus = require('./event-bus.js').CQEventBus
const $Callable = require('./util/callable')
const message = require('./message')
const {
    parse: parseCQTags
} = message
const {
    SocketError,
    InvalidWsTypeError,
    InvalidContextError,
    APITimeoutError,
    UnexpectedContextError
} = require('./errors')

const WebSocketType = {
    API: '/api',
    EVENT: '/event'
}

const WebSocketState = {
    DISABLED: -1,
    INIT: 0,
    CONNECTING: 1,
    CONNECTED: 2,
    CLOSING: 3,
    CLOSED: 4
}

const WebSocketProtocols = [
    'https:',
    'http:',
    'ws:',
    'wss:'
]

class CQWebSocket extends $Callable {
    constructor({
        // connectivity configs
        protocol = 'ws:',
        host = '127.0.0.1',
        port = 6700,
        accessToken = '',
        baseUrl,

        // application aware configs
        enableAPI = true,
        enableEvent = true,
        qq = -1,

        // reconnection configs
        reconnection = true,
        reconnectionAttempts = Infinity,
        reconnectionDelay = 1000,

        // API request options
        requestOptions = {},

        // underlying websocket configs, only meaningful in Nodejs environment
        fragmentOutgoingMessages = false,
        fragmentationThreshold,
        tlsOptions
    } = {}) {
        super('__call__')

        /// *****************/
        //     poka-yoke 😇
        /// *****************/
        protocol = protocol.toLowerCase()
        if (protocol && !protocol.endsWith(':')) protocol += ':'
        if (
            baseUrl &&
            WebSocketProtocols.filter(proto => baseUrl.startsWith(proto + '//')).length === 0
        ) {
            baseUrl = `${protocol}//${baseUrl}`
        }

        /// *****************/
        //     options
        /// *****************/

        this._token = String(accessToken)
        this._qq = parseInt(qq)
        this._baseUrl = baseUrl || `${protocol}//${host}:${port}`

        this._reconnectOptions = {
            reconnection,
            reconnectionAttempts,
            reconnectionDelay
        }

        this._requestOptions = requestOptions

        this._wsOptions = {}

        Object
            .entries({
                fragmentOutgoingMessages,
                fragmentationThreshold,
                tlsOptions
            })
            .filter(([k, v]) => v !== undefined)
            .forEach(([k, v]) => {
                this._wsOptions[k] = v
            })

        /// *****************/
        //     states
        /// *****************/

        this._monitor = {
            EVENT: {
                attempts: 0,
                state: enableEvent ? WebSocketState.INIT : WebSocketState.DISABLED,
                reconnecting: false
            },
            API: {
                attempts: 0,
                state: enableAPI ? WebSocketState.INIT : WebSocketState.DISABLED,
                reconnecting: false
            }
        }

        /**
         * @type {Map<string, {onSuccess:Function,onFailure:Function}>}
         */
        this._responseHandlers = new Map()

        this._eventBus = new $CQEventBus(this)
    }

    off(eventType, handler) {
        this._eventBus.off(eventType, handler)
        return this
    }

    on(eventType, handler) {
        this._eventBus.on(eventType, handler)
        return this
    }

    once(eventType, handler) {
        this._eventBus.once(eventType, handler)
        return this
    }

    __call__(method, params, optionsIn) {
        if (!this._apiSock) return Promise.reject(new Error('API socket has not been initialized.'))

        let options = {
            timeout: Infinity,
            ...this._requestOptions
        }

        if (typeof optionsIn === 'number') {
            options.timeout = optionsIn
        } else if (typeof optionsIn === 'object') {
            options = {
                ...options,
                ...optionsIn
            }
        }

        return new Promise((resolve, reject) => {
            let ticket
            const apiRequest = {
                action: method,
                params: params
            }

            this._eventBus.emit('api.send.pre', apiRequest)

            const onSuccess = (ctxt) => {
                if (ticket) {
                    clearTimeout(ticket)
                    ticket = undefined
                }
                this._responseHandlers.delete(reqid)
                delete ctxt.echo
                resolve(ctxt)
            }

            const onFailure = (err) => {
                this._responseHandlers.delete(reqid)
                reject(err)
            }

            const reqid = shortid.generate()

            this._responseHandlers.set(reqid, {
                onFailure,
                onSuccess
            })
            this._apiSock.send(JSON.stringify({
                ...apiRequest,
                echo: {
                    reqid
                }
            }))

            this._eventBus.emit('api.send.post')

            if (options.timeout < Infinity) {
                ticket = setTimeout(() => {
                    this._responseHandlers.delete(reqid)
                    onFailure(new APITimeoutError(options.timeout, apiRequest))
                }, options.timeout)
            }
        })
    }

    _handle(msgObj) {
        switch (msgObj.post_type) {
            case 'message':
                // parsing coolq tags
                const tags = parseCQTags(msgObj.message)

                switch (msgObj.message_type) {
                    case 'private':
                        this._eventBus.emit('message.private', msgObj, tags)
                        break
                    case 'discuss':
                        {
                            // someone is @-ed
                            const attags = tags.filter(t => t.tagName === 'at')
                            if (attags.length > 0) {
                                if (attags.filter(t => t.qq === this._qq).length > 0) {
                                    this._eventBus.emit('message.discuss.@.me', msgObj, tags)
                                } else {
                                    this._eventBus.emit('message.discuss.@', msgObj, tags)
                                }
                            } else {
                                this._eventBus.emit('message.discuss', msgObj, tags)
                            }
                        }
                        break
                    case 'group':
                        {
                            const attags = tags.filter(t => t.tagName === 'at')
                            if (attags.length > 0) {
                                if (attags.filter(t => t.qq === this._qq).length > 0) {
                                    this._eventBus.emit('message.group.@.me', msgObj, tags)
                                } else {
                                    this._eventBus.emit('message.group.@', msgObj, tags)
                                }
                            } else {
                                this._eventBus.emit('message.group', msgObj, tags)
                            }
                        }
                        break
                    default:
                        this._eventBus.emit('error', new UnexpectedContextError(
                            msgObj,
                            'unexpected "message_type"'
                        ))
                }
                break
            case 'notice': // Added, reason: CQHttp 4.X
                switch (msgObj.notice_type) {
                    case 'group_upload':
                        this._eventBus.emit('notice.group_upload', msgObj)
                        break
                    case 'group_admin':
                        switch (msgObj.sub_type) {
                            case 'set':
                                this._eventBus.emit('notice.group_admin.set', msgObj)
                                break
                            case 'unset':
                                this._eventBus.emit('notice.group_admin.unset', msgObj)
                                break
                            default:
                                this._eventBus.emit('error', new UnexpectedContextError(
                                    msgObj,
                                    'unexpected "sub_type"'
                                ))
                        }
                        break
                    case 'group_decrease':
                        switch (msgObj.sub_type) {
                            case 'leave':
                                this._eventBus.emit('notice.group_decrease.leave', msgObj)
                                break
                            case 'kick':
                                this._eventBus.emit('notice.group_decrease.kick', msgObj)
                                break
                            case 'kick_me':
                                this._eventBus.emit('notice.group_decrease.kick_me', msgObj)
                                break
                            default:
                                this._eventBus.emit('error', new UnexpectedContextError(
                                    msgObj,
                                    'unexpected "sub_type"'
                                ))
                        }
                        break
                    case 'group_increase':
                        switch (msgObj.sub_type) {
                            case 'approve':
                                this._eventBus.emit('notice.group_increase.approve', msgObj)
                                break
                            case 'invite':
                                this._eventBus.emit('notice.group_increase.invite', msgObj)
                                break
                            default:
                                this._eventBus.emit('error', new UnexpectedContextError(
                                    msgObj,
                                    'unexpected "sub_type"'
                                ))
                        }
                        break
                    case 'friend_add':
                        this._eventBus.emit('notice.friend_add', msgObj)
                        break
                    case 'group_ban':
                        switch (msgObj.sub_type) {
                            case 'ban':
                                this._eventBus.emit('notice.group_ban.ban', msgObj)
                                break
                            case 'lift_ban':
                                this._eventBus.emit('notice.group_ban.lift_ban', msgObj)
                                break
                            default:
                                this._eventBus.emit('error', new UnexpectedContextError(
                                    msgObj,
                                    'unexpected "sub_type"'
                                ))
                        }
                        break
                    case "group_recall":
                        this._eventBus.emit("notice.group_recall", msgObj); //群内有撤回消息
                        break;
                    case "friend_recall":
                        this._eventBus.emit("notice.friend_recall", msgObj); //好友撤回消息
                        break;
                    default:
                        this._eventBus.emit('error', new UnexpectedContextError(
                            msgObj,
                            'unexpected "notice_type"'
                        ))
                }
                break
            case 'request':
                switch (msgObj.request_type) {
                    case 'friend':
                        this._eventBus.emit('request.friend', msgObj)
                        break
                    case 'group':
                        switch (msgObj.sub_type) {
                            case 'add':
                                this._eventBus.emit('request.group.add', msgObj)
                                break
                            case 'invite':
                                this._eventBus.emit('request.group.invite', msgObj)
                                break
                            default:
                                this._eventBus.emit('error', new UnexpectedContextError(
                                    msgObj,
                                    'unexpected "sub_type"'
                                ))
                        }
                        break
                    default:
                        this._eventBus.emit('error', new UnexpectedContextError(
                            msgObj,
                            'unexpected "request_type"'
                        ))
                }
                break
            case 'meta_event':
                switch (msgObj.meta_event_type) {
                    case 'lifecycle':
                        this._eventBus.emit('meta_event.lifecycle', msgObj)
                        break
                    case 'heartbeat':
                        this._eventBus.emit('meta_event.heartbeat', msgObj)
                        break
                    default:
                        this._eventBus.emit('error', new UnexpectedContextError(
                            msgObj,
                            'unexpected "meta_event_type"'
                        ))
                }
                break
            default:
                this._eventBus.emit('error', new UnexpectedContextError(
                    msgObj,
                    'unexpected "post_type"'
                ))
        }
    }

    /**
     * @param {(wsType: "/api"|"/event", label: "EVENT"|"API", client: $WebSocket) => void} cb
     * @param {"/api"|"/event"} [types]
     */
    _forEachSock(cb, types = [WebSocketType.EVENT, WebSocketType.API]) {
        if (!Array.isArray(types)) {
            types = [types]
        }

        types.forEach((wsType) => {
            cb(wsType, wsType === WebSocketType.EVENT ? 'EVENT' : 'API')
        })
    }

    isSockConnected(wsType) {
        if (wsType === WebSocketType.API) {
            return this._monitor.API.state === WebSocketState.CONNECTED
        } else if (wsType === WebSocketType.EVENT) {
            return this._monitor.EVENT.state === WebSocketState.CONNECTED
        } else {
            throw new InvalidWsTypeError(wsType)
        }
    }

    connect(wsType) {
        this._forEachSock((_type, _label) => {
            if ([WebSocketState.INIT, WebSocketState.CLOSED].includes(this._monitor[_label].state)) {
                const tokenQS = this._token ? `?access_token=${this._token}` : ''

                let _sock = new $WebSocket(`${this._baseUrl}/${_label.toLowerCase()}${tokenQS}`, undefined, this._wsOptions)

                if (_type === WebSocketType.EVENT) {
                    this._eventSock = _sock
                } else {
                    this._apiSock = _sock
                }

                _sock.addEventListener('open', () => {
                    this._monitor[_label].state = WebSocketState.CONNECTED
                    this._eventBus.emit('socket.connect', WebSocketType[_label], _sock, this._monitor[_label].attempts)
                    if (this._monitor[_label].reconnecting) {
                        this._eventBus.emit('socket.reconnect', WebSocketType[_label], this._monitor[_label].attempts)
                    }
                    this._monitor[_label].attempts = 0
                    this._monitor[_label].reconnecting = false

                    if (this.isReady()) {
                        this._eventBus.emit('ready', this)

                        // if /api is not disabled, it is ready now.
                        // if qq < 0, it is not configured manually by user
                        if (this._monitor.API.state !== WebSocketState.DISABLED && this._qq < 0) {
                            this('get_login_info')
                                .then((ctxt) => {
                                    this._qq = parseInt($get(ctxt, 'data.user_id', -1))
                                })
                                .catch(err => {
                                    this._eventBus.emit('error', err)
                                })
                        }
                    }
                }, {
                    once: true
                })

                const _onMessage = (e) => {
                    let context
                    try {
                        context = JSON.parse(e.data)
                    } catch (err) {
                        this._eventBus.emit('error', new InvalidContextError(_type, e.data))
                        return
                    }

                    if (_type === WebSocketType.EVENT) {
                        this._handle(context)
                    } else {
                        const reqid = $get(context, 'echo.reqid', '')

                        let {
                            onSuccess
                        } = this._responseHandlers.get(reqid) || {}

                        if (typeof onSuccess === 'function') {
                            onSuccess(context)
                        }

                        this._eventBus.emit('api.response', context)
                    }
                }
                _sock.addEventListener('message', _onMessage)

                _sock.addEventListener('close', (e) => {
                    this._monitor[_label].state = WebSocketState.CLOSED
                    this._eventBus.emit('socket.close', WebSocketType[_label], e.code, e.reason)
                        // code === 1000 : normal disconnection
                    if (e.code !== 1000 && this._reconnectOptions.reconnection) {
                        this.reconnect(this._reconnectOptions.reconnectionDelay, WebSocketType[_label])
                    }

                    // clean up events
                    _sock.removeEventListener('message', _onMessage)

                    // clean up refs
                    _sock = null
                    if (_type === WebSocketType.EVENT) {
                        this._eventSock = null
                    } else {
                        this._apiSock = null
                    }
                }, {
                    once: true
                })

                _sock.addEventListener('error', () => {
                    const errMsg = this._monitor[_label].state === WebSocketState.CONNECTING ?
                        'Failed to establish the websocket connection.' :
                        this._monitor[_label].state === WebSocketState.CONNECTED ?
                        'The websocket connection has been hung up unexpectedly.' :
                        `Unknown error occured. Conection state: ${this._monitor[_label].state}`
                    this._eventBus.emit('socket.error', WebSocketType[_label], new SocketError(errMsg))

                    if (this._monitor[_label].state === WebSocketState.CONNECTED) {
                        // error occurs after the websocket is connected
                        this._monitor[_label].state = WebSocketState.CLOSING
                        this._eventBus.emit('socket.closing', WebSocketType[_label])
                    } else if (this._monitor[_label].state === WebSocketState.CONNECTING) {
                        // error occurs while trying to establish the connection
                        this._monitor[_label].state = WebSocketState.CLOSED
                        this._eventBus.emit('socket.failed', WebSocketType[_label], this._monitor[_label].attempts)
                        if (this._monitor[_label].reconnecting) {
                            this._eventBus.emit('socket.reconnect_failed', WebSocketType[_label], this._monitor[_label].attempts)
                        }
                        this._monitor[_label].reconnecting = false
                        if (this._reconnectOptions.reconnection &&
                            this._monitor[_label].attempts <= this._reconnectOptions.reconnectionAttempts
                        ) {
                            this.reconnect(this._reconnectOptions.reconnectionDelay, WebSocketType[_label])
                        } else {
                            this._eventBus.emit('socket.max_reconnect', WebSocketType[_label], this._monitor[_label].attempts)
                        }
                    }
                }, {
                    once: true
                })

                this._monitor[_label].state = WebSocketState.CONNECTING
                this._monitor[_label].attempts++
                    this._eventBus.emit('socket.connecting', _type, this._monitor[_label].attempts)
            }
        }, wsType)
        return this
    }

    disconnect(wsType) {
        this._forEachSock((_type, _label) => {
            if (this._monitor[_label].state === WebSocketState.CONNECTED) {
                const _sock = _type === WebSocketType.EVENT ? this._eventSock : this._apiSock

                this._monitor[_label].state = WebSocketState.CLOSING
                    // explicitly provide status code to support both browsers and Node environment
                _sock.close(1000, 'Normal connection closure')
                this._eventBus.emit('socket.closing', _type)
            }
        }, wsType)
        return this
    }

    reconnect(delay, wsType) {
        if (typeof delay !== 'number') delay = 0

        const _reconnect = (_type, _label) => {
            setTimeout(() => {
                this.connect(_type)
            }, delay)
        }

        this._forEachSock((_type, _label) => {
            if (this._monitor[_label].reconnecting) return

            switch (this._monitor[_label].state) {
                case WebSocketState.CONNECTED:
                    this._monitor[_label].reconnecting = true
                    this._eventBus.emit('socket.reconnecting', _type, this._monitor[_label].attempts)
                    this.disconnect(_type)
                    this._eventBus.once('socket.close', (_closedType) => {
                        return _closedType === _type ? _reconnect(_type, _label) : false
                    })
                    break
                case WebSocketState.CLOSED:
                case WebSocketState.INIT:
                    this._monitor[_label].reconnecting = true
                    this._eventBus.emit('socket.reconnecting', _type, this._monitor[_label].attempts)
                    _reconnect(_type, _label)
            }
        }, wsType)
        return this
    }

    isReady() {
        let isEventReady = this._monitor.EVENT.state === WebSocketState.DISABLED || this._monitor.EVENT.state === WebSocketState.CONNECTED
        let isAPIReady = this._monitor.API.state === WebSocketState.DISABLED || this._monitor.API.state === WebSocketState.CONNECTED
        return isEventReady && isAPIReady
    }
}

module.exports = {
    default: CQWebSocket,
    CQWebSocket,
    WebSocketType,
    WebSocketState,
    SocketError,
    InvalidWsTypeError,
    InvalidContextError,
    APITimeoutError,
    UnexpectedContextError,
    ...message
}