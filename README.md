# node-cq-websocket
[![Build Status](https://travis-ci.org/momocow/node-cq-websocket.svg?branch=master)](https://travis-ci.org/momocow/node-cq-websocket)
[![Coverage Status](https://coveralls.io/repos/github/momocow/node-cq-websocket/badge.svg?branch=master)](https://coveralls.io/github/momocow/node-cq-websocket?branch=master)
[![license](https://img.shields.io/github/license/momocow/node-cq-websocket.svg)](https://github.com/momocow/node-cq-websocket#readme)
[![npm](https://img.shields.io/npm/dt/cq-websocket.svg)](https://www.npmjs.com/package/cq-websocket)
[![npm](https://img.shields.io/npm/v/cq-websocket.svg)](https://www.npmjs.com/package/cq-websocket)
[![CQHttp](https://img.shields.io/badge/dependency-CQHttp-green.svg)](https://github.com/richardchien/coolq-http-api#readme)  

> 本 SDK 兼容 CoolQ HTTP API v3.X 及 v4.X 兩個版本。

> **!!特別注意!!** 本 SDK 尚處於測試階段，使用上仍有機會碰到Bug，歡迎提交PR或issue回報。
> 由於付費問題，本 SDK 目前僅針對酷Q Air做測試。

本項目為酷Q的 CoolQ HTTP API 插件支持 websocket 部分之 Node SDK。  
關於 CoolQ HTTP API 插件，見 [richardchien/coolq-http-api](https://github.com/richardchien/coolq-http-api#readme)

## Known Issues
- CoolQ HTTP API 插件尚未支援收發 Fragmant, 暫時禁用
  - 自`v1.2.6`
  - [node-cq-websocket #2](https://github.com/momocow/node-cq-websocket/pull/2)
  - [coolq-http-api #85](https://github.com/richardchien/coolq-http-api/issues/85)

## 開發日誌
列為`棄用`表示**仍然支援**, 但請盡速修正為最新版本的實作。
### 1.4.0
增強對連線的管理與維護, 斷線後自動嘗試重新連線。
- 新增
  - [`off()` 方法](#cqwebsocket-offevent_type-listener)以移除指定監聽器。
  - [reconnect() 方法](#cqwebsocket-reconnectdelay-wstype)以重新建立連線。
  - [isSockConnected() 方法](#cqwebsocket-issockconnectedwstype)檢測 socket 是否正在連線。
  - 為 [`connect()`](#cqwebsocket-connectwstype), [`disconnect()`](#cqwebsocket-disconnectwstype), [`reconnect()`](#cqwebsocket-reconnectdelay-wstype) 三個方法新增參數 `wsType` 以指定目標連線, 若 `wsType` 為 undefined 則為全部連線。
  - `socket.connecting`, `socket.failed` 及 `socket.closing` 事件(參見 [socket 子事件](#socket-子事件))。
  - [CQWebsocket 建構子](#new-cqwebsocketopt)新增額外3個設定, `reconnection`, `reconnectionAttempts` 及 `reconnectionDelay`, 提供連線失敗時自動重連之功能。
- 修正
  - [`once()` 方法](#cqwebsocket-onceevent_type-listener)執行後無法正確移除監聽器之問題。
- 棄用
  - `isConnected()` 方法
  > 重新命名為 [`isReady()`](#cqwebsocket-isready)。

### v1.3.0
兼容 CoolQ HTTP API v3.x 及 v4.x 兩個主版本。
- 新增
  - 給予 CoolQ HTTP API v4.x 之上報事件 `notice` 實作更多[子事件](#notice-子事件)。(群文件上傳, 群管變動, 群成員增減, 好友添加)
  - 給予上報事件 `request` 實作更多[子事件](#request-子事件)。(好友請求, 群請求/群邀請)
- 棄用
  - 上報事件: `event` -> 請改用 `notice`事件。
### v1.2.6
- 修改
  - 禁用 websocket fragment, 待 CoolQ HTTP API 修正問題時再次啟用。
  > 於此帖追蹤進度。[coolq-http-api #85](https://github.com/richardchien/coolq-http-api/issues/85)

## 使用方式
1. 通過 `npm install cq-websocket` 安裝 SDK
2. 將 SDK 導入代碼   
```
const CQWebsocket = require('cq-websocket')
```
> 該導入過程引用了一個類別進來，以下將以 `CQWebsocket` 作為該類別名稱進行說明，實際使用時請依自己的命名編寫。

## 關於 `CQWebsocket` 類別
為此 SDK 的主要類別，底下封裝了兩個用於與 CoolQ HTTP API 連線之 socket，分別為 `/api` 和 `/event` (詳細功能描述可見 [coolq-http-api/websocket](https://cqhttp.cc/docs/4.2/#/WebSocketAPI?id=api-%E6%8E%A5%E5%8F%A3))。

## 創建實例
### new CQWebsocket(`opt`)
- `opt` object

| 屬性 | 類型 | 默認值 |  說明
| - | - | - | - |
| `access_token` | string | `""` | API 訪問 token 。見 CoolQ HTTP API 之[配置文件說明](https://cqhttp.cc/docs/4.2/#/Configuration) |
|  `enableAPI` | boolean | `true` | 啟用 /api 連線 |
|  `enableEvent` | boolean | `true` | 啟用 /event 連線 |
|  `host` | string | `"127.0.0.1"` | 伺服器 IP |
|  `port` | number | 6700 | 伺服器端口 |
|  `qq` | number &#124; string | -1 | 觸發 `@me` 事件用的QQ帳號，通常同登入酷Q之帳號，用在討論組消息及群消息中辨認是否有人at此帳號 |
|  `reconnection` | boolean | true | 是否連線錯誤時自動重連 |
|  `reconnectionAttempts` | number | Infinity | **連續**連線失敗的次數不超過這個值 |
|  `reconnectionDelay` | number | 1000 | 重複連線的延遲時間, 單位: ms |

- 返回值: 一個新配置的 `CQWebsocket` 類別實例

## 自動重新連線說明
將 `reconnection` 設定為 true 啟用自動重連, 

## 建立連線
### CQWebsocket #connect(wsType)
- `wsType` [WebsocketType](#cqwebsocketwebsockettype-實例)
- 返回值： `this`  
- 事件
  - `socket.connecting` 呼叫後立刻觸發，在任何連線嘗試之前。
  - `socket.connect` 連線成功。
  - `socket.failed` 連線失敗。
  - `socket.error` 連線失敗會一併觸發 error 事件。

`socket.connecting` 及 `socket.connect` 事件中帶有 attempts 參數, 可以用來對照哪次連線是否成功, attempts 的值表示**連續** *(N - 1)* 次失敗後的第 *N* 次連線嘗試。

attempts 會在連線成功後歸零。

範例:
```js
const CQWebsocket = require('cq-websocket')
const { WebsocketType } = CQWebsocket
const bot = new CQWebsocket()

// 手動連接兩個連線
bot.connect(WebsocketType.API)
bot.connect(WebsocketType.EVENT)

// 上面兩行 connect 代碼等同這一句
bot.connect()

bot.on('socket.connecting', function (wsType, attempts) {
  console.log('嘗試第 %d 次連線 _(:з」∠)_', attempts)
}).on('socket.connect', function (wsType, sock, attempts) {
  console.log('第 %d 次連線嘗試成功 ヽ(✿ﾟ▽ﾟ)ノ', attempts)
}).on('socket.failed', function (wsType, attempts) {
  console.log('第 %d 次連線嘗試失敗 。･ﾟ･(つд`ﾟ)･ﾟ･', attempts)
})
```

## 斷開連線
### CQWebsocket #disconnect(wsType)
- `wsType` [WebsocketType](#cqwebsocketwebsockettype-實例)
- 返回值： `this`
- 事件
  - `socket.close` 連線斷開後。

## 重新連線
### CQWebsocket #reconnect(delay, wsType)
- `delay` number
- `wsType` [WebsocketType](#cqwebsocketwebsockettype-實例)
- 返回值： `this`
- 事件
  > 此方法會先呼叫 disconnect() 等待 `socket.close` 事件觸發後再呼叫 connect(), 可以參考以上兩個方法的事件。

斷開現有連線, 並重新建立連線。

`delay`單位為 ms，表示`socket.close`**事件觸發後的延遲時間**, 延遲時間過後才會呼叫 connect()。

## 檢測連線
### CQWebsocket #isSockConnected(wsType)
- `wsType` [WebsocketType](#cqwebsocketwebsockettype-實例)
- 返回值： `boolean`

若未給定 wsType 則使方法會拋出錯誤。

## 連線就緒
### CQWebsocket #isReady()
- 返回值： `boolean`

檢查連線狀態是否就緒。

> 僅檢查已透過 `enableAPI` 及 `enableEvent` 啟用之連線。

> 原 #isConnected() 方法。

## 方法調用
### CQWebsocket(`method`, `params`)
- `method` string
- `params` object
- 返回值： `this`

`CQWebsocket` 的實例可直接作為方法調用，用於透過 `/api` 連線操作酷Q。  
`method` 為欲調用的行為，透過 `params` 物件夾帶參數，詳細的規格請見 CoolQ HTTP API 之 [API 列表](https://cqhttp.cc/docs/4.2/#/API?id=api-%E5%88%97%E8%A1%A8)。

## 事件處理
事件處理應為機器人的運行過程中最主要的環節，情報收集主要是透過來自 `/event` 連線的事件上報，判讀事件文本並採取方法調用。

### CQWebsocket #on(`event_type`, `listener`)
- `event_type` string
- `listener` function(`...args`){ }
  - `...args` 依事件類型不同，監聽器的參數也有所不同，詳細對應見下表。
  - 返回值： `string` | `Promise <string>`  | `void`
- 返回值： `this`

註冊常駐監聽器。

若返回值為 `string` 或一個受理值 (resolved value) 為 `string` 之承諾 (Promise) 對象，則以該文字訊息作為響應發送。

### CQWebsocket #once(`event_type`, `listener`)
- `event_type` string
- `listener` function(`...args`){ }
  - `...args` 依事件類型不同，監聽器的參數也有所不同，詳細對應見下表。
  - 返回值： `string` | `boolean` | `void`
- 返回值： `this`

註冊一次性監聽器。

當返回值為 `boolean` 且為 `false` ，指涉該監聽器並未完成任務，則保留該監聽器繼續聽取事件，不做移除。下一次事件發生時，該監聽器在調用後會再次以返回值判定去留。若返回值為 `boolean` 且為 `true` ，指涉該監聽器處理完畢，立即移除。

若返回值為 `string` ，則立即以該文字訊息作為響應發送，並移除該監聽器。

### CQWebsocket #off(`event_type`, `listener`)
- `event_type` string
- `listener` function
- 返回值： `this`

關於判定會被移除的監聽器, 以下條件, 第一個成立即適用。
1. 若 `event_type` 不為字串, 則移除所有監聽器, 並且安裝默認的 `socket.error` 監聽器
2. 若 `listener` 不為方法, 則移除所有 `event_type` 所指定事件下的監聽器, 若 `event_type` 指定的事件不存在則無事。
3. 移除 `event_type` 下的 `listener` 監聽器(**參照 reference 須相同!**), 若 `listener` 不存在則無事。

#### 基本事件
前三個基本事件之說明，可以另外參考 CoolQ HTTP API 的[數據上報格式](https://cqhttp.cc/docs/4.2/#/Post?id=%E4%B8%8A%E6%8A%A5%E6%95%B0%E6%8D%AE%E6%A0%BC%E5%BC%8F)。

參數 `context` 可見[事件列表](https://cqhttp.cc/docs/4.2/#/Post?id=%E4%BA%8B%E4%BB%B6%E5%88%97%E8%A1%A8)。

| 事件類型 | 監聽器參數 `...args` | 說明 |
| - | - | - |
| message | `event` [CQEvent](#cqevent-類別)<br> `context` object| 所有流入的訊息。 |
| ~~event~~ | `context` object | **[棄用]** 群組人數變化...等QQ事件。(此事件不支援子事件, 若需要 notice 子事件, 請將 CoolQ HTTP API 升級至 v4.x) |
| notice  | `context` object | 群文件上傳, 群管變動, 群成員增減, 好友添加...等QQ事件。 |
| request | `context` object | 好友請求, 群請求/群邀請...等QQ事件。 |
| error | `err` Error | CoolQ HTTP API 送來之消息文本缺乏 `post_type` 字段 (理論上不會有這個事件發生)。 |
| ready | `type` [WebsocketType](#cqwebsocketwebsockettype-實例) <br> `this` | 連線成功並初始化完成，可以開始調用API (送消息...等操作)。 |

#### `message` 子事件
| 事件類型 | 監聽器參數 | 說明 |
| - | - | - |
| message.private | `event` CQEvent <br> `context` object | 私聊消息。 |
| message.discuss | `event` CQEvent <br> `context` object | 討論組消息。 |
| message.discuss.@me | `event` CQEvent <br> `context` object | 有人於討論組消息at機器人。 |
| message.group | `event` CQEvent <br> `context` object | 群消息。 |
| message.group.@me | `event` CQEvent <br> `context` object | 有人於群消息at機器人。 |

#### `notice` 子事件
| 事件類型 | 監聽器參數 | 說明 |
| - | - | - |
| notice.group_upload | `context` object | 群文件上傳。 |
| notice.group_admin.set | `context` object | 設置管理員。 |
| notice.group_admin.unset | `context` object | 取消管理員。 |
| notice.group_decrease.leave | `context` object | 自主退群。 |
| notice.group_decrease.kick | `context` object | 被動踢出群。 |
| notice.group_decrease.kick_me | `context` object | 機器人被踢出群。 |
| notice.group_increase.approve | `context` object | 管理員同意入群。 |
| notice.group_increase.invite | `context` object | 管理員邀請入群。 |
| notice.friend_add | `context` object | 新添加好友。 |

#### `request` 子事件
| 事件類型 | 監聽器參數 | 說明 |
| - | - | - |
| request.friend | `event` CQEvent <br> `context` object | 私聊消息。 |
| request.group.add | `event` CQEvent <br> `context` object | 加群請求。 |
| request.group.invite | `event` CQEvent <br> `context` object | 邀請入群。 |

#### `socket` 子事件
底層 socket 連線的事件, 可用於掌握連線狀況。

| 事件類型 | 監聽器參數 | 說明 |
| - | - | - |
| socket.connecting | `type` WebsocketType <br> `attempts` number | 開始嘗試連線, 連線成功/失敗之前。 |
| socket.connect | `type` WebsocketType <br> `socket` [WebSocketConnection](https://github.com/theturtle32/WebSocket-Node/blob/d941f975e8ef6b55eafc0ef45996f4198013832c/docs/WebSocketConnection.md#websocketconnection) <br> `attempts` number | 連線成功後，尚未初始化之前。 |
| socket.closing | `type` WebsocketType | 連線關閉之前。 |
| socket.close | `type` WebsocketType <br> `code` number <br> `desc` string | 連線關閉。(連線關閉代碼 `code` 可參照 [RFC 文件](https://tools.ietf.org/html/rfc6455#section-7.4))) |
| socket.failed | `type` WebsocketType <br> `attempts` number | 連線失敗。 |
| socket.error | `type` WebsocketType <br> `err` Error | 連線錯誤。 |

#### `api` 子事件
| 事件類型 | 監聽器參數 | 說明 |
| - | - | - |
| api.send.pre | `type` WebsocketType <br> `apiRequest` object | 傳送 API 請求之前。關於 `apiRequest` 可見 [/api/接口說明](https://cqhttp.cc/docs/4.2/#/WebSocketAPI?id=api-%E6%8E%A5%E5%8F%A3)。 |
| api.send.post | `type` WebsocketType | 傳送 API 請求之後。  |
| api.response | `type` WebsocketType <br> `result` object | 對於 API 請求的回應。詳細格式見 [/api/接口說明](https://cqhttp.cc/docs/4.2/#/WebSocketAPI?id=api-%E6%8E%A5%E5%8F%A3)。 |

> 註： `socket` 及 `api` 並未擁有基本事件，在這邊僅作 namespace 用途與其他常用事件作區別。  

### 事件傳播
事件具有向上傳播的機制，一個事件上報之後，該事件之所有親事件也會依序上報。關於事件親子關係的構成，可參考下方[事件樹](#事件樹)。(換而言之，在事件名稱上就是以 `.` 將親代串接子代)

舉個例子，群消息有人at某機器人，該機器人則會首先上報 `message.group.@me` 事件，該事件之親事件由下而上依序為 `message.group` 、 `message` ，則這兩個事件也會依照這個順序上報。

`message` 及其子事件的監聽器第一個參數： `CQEvent` 類別的實例，在這個機制中扮演重要的角色。透過 `CQEvent` 實例，所有監聽器皆可在自己的運行期間調用 `CQEvent #cancel()` 方法聲明自己的處理權，以截獲事件並阻斷後續監聽器的調用，並立即以該事件返回之文字訊息(或透過調用 `CQEvent #setMessage(msg)` 設定之文字訊息，也可以透過 `Promise` 對象 resolve 之文字訊息)作為響應，送回至 CoolQ HTTP API 。

由於在一次事件傳播中的所有監聽器都會收到同一個 `CQEvent` 實例，因此對於響應的決定方式，除了 `CQEvent #cancel()` 所提供的事件截獲機制之外，也可以採取協議式的方式，就是透過每個監聽器調用 `CQEvent #getMessage()` `CQEvent #setMessage(msg)` 協議出一個最終的響應訊息。

CQEvent 的方法描述，見 [CQEvent](#cqevent-類別)。
> 目前僅 `message` 及其子事件支援 CQEvent 相關機制。


#### 事件樹
```
├─ event (棄用) 
├─ notice
│    ├─ group_upload
│    ├─ group_admin
│    │    ├─ set
│    │    └─ unset
│    ├─ group_decrease
│    │    ├─ leave
│    │    ├─ kick
│    │    └─ kick_me
│    ├─ group_increase
│    │    ├─ approve
│    │    └─ invite
│    └─ friend_add
├─ request 
│    ├─ friend
│    └─ group
|         ├─ add
|         └─ invite
├─ error  
├─ ready  
├─ socket ※
│    ├─ connect  
│    ├─ close    
│    └─ error
├─ api ※
│    ├─ response  
│    └─ send ※
│        ├─ pre    
│        └─ post  
└─ message
     ├─ private
     ├─ discuss
     │    └─ @me
     └─ group
          └─ @me

※: 表示無法在該節點進行監聽
```

### `socket.error` 默認監聽器
由於 `socket.error` 屬於連線失誤的事件，如果沒有適當的監聽器配套措施，會造成無防備的狀況下無法順利連線，徒增猿們除蟲困擾。

為此而產生了 `socket.error` 事件之默認監聽器，當開發者沒有主動監聽 `socket.error` 事件，則會使用默認監聽器，發生錯誤時會將收到的錯誤實例拋出，而該錯誤實例下有一個 `which` 字段(內容為 `string` 類型且必為 `/api` `/event` 兩者任一)指出是哪一個連線出了問題。

該錯誤可透過在 `process` 上監聽 `uncaughtException` 事件取得。如下所示：
```
process.on('uncaughtException', function(err){
  switch(err.which){
    case CQWebsocket.WebsocketType.API:
      // 錯誤處理
      break
    case CQWebsocket.WebsocketType.EVENT:
      // 錯誤處理
      break
  }
})

// CQWebsocket.WebsocketType 下提供兩個常量對應分別至 /api 及 /event
```

## `CQEvent` 類別
### CQEvent #isCanceled()
- 返回值： `boolean`

監聽器中調用這個方法基本上是 `true` ，畢竟該監聽器仍可以運行表示事件沒有被截獲。

### CQEvent #cancel()
- 返回值： `void`

截獲事件並停止[事件傳播](#事件傳播)。

### CQEvent #getMessage()
- 返回值： `string`

取得目前的響應訊息。

### CQEvent #setMessage(`msg`)
- `msg` string
- 返回值： `void`

設置響應訊息。

### CQEvent #hasMessage()
- 返回值： `boolean`

是否有響應訊息。

## `CQWebsocket.WebsocketType` 實例
下有兩個常量對應至 `/api` 及 `/event` 。

### `WebsocketType.API`
= `"/api"` string

### `WebsocketType.EVENT`
= `"/event"` string


## 範例
基本創建一個複讀機器人的代碼範例如下(可參見[demo/echo-bot.js](https://github.com/momocow/node-cq-websocket/blob/master/demo/echo-bot.js))：
```
const CQWebsocket = require('cq-websocket')

// 採用默認參數創建機器人實例
let bot = new CQWebsocket()

// 設定訊息監聽
bot.on('message', (e, context) => {
  // 以下提供三種方式將原訊息以原路送回

  // 1. 調用 CoolQ HTTP API 之 send_msg 方法
  bot('send_msg', context)

  // 2. 或者透過返回值快速響應
  // return context.message

  // 3. 或者透過CQEvent實例，先獲取事件處理權再設置響應訊息
  // e.cancel()
  // e.setMessage(context.message)
})

bot.connect()
```

## SDK 開發環境
### 下載源碼
`git clone https://github.com/momocow/node-cq-websocket.git`

### 安裝依賴
`npm install` 或 `yarn install`

### 單元測試
`npm test`

### 在酷Q環境進行測試
1. 請先配置好CoolQ。
2. 安裝 CoolQ HTTP API 插件，正確地配置 websocket 伺服器並啟用。可參考該插件之[配置文件說明](https://cqhttp.cc/docs/4.2/#/Configuration)。
3. 測試用的配置文件位於 `./demo/config.json` ，該配置內容請符合 CoolQ HTTP API 插件內關於websocket的配置。
4. `npm run demo`
5. 本測試為複讀所有私聊訊息，避免打擾機器人所屬的群組，你可以私聊你的機器人進行測試。
