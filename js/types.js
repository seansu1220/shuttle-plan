// 跨模組資料結構定義（JSDoc 型別，僅供編輯器檢查與閱讀，執行時不產生程式碼）。

/**
 * @typedef {Object} LatLng
 * @property {number} lat
 * @property {number} lng
 */

/**
 * @typedef {Object} Station 分隊
 * @property {string} code 代碼（用於網址參數，例如 FX）
 * @property {string} name
 * @property {number} lat
 * @property {number} lng
 * @property {string} note
 */

/**
 * @typedef {Object} TransferPoint 接駁點
 * @property {string} code
 * @property {string} name
 * @property {number} lat
 * @property {number} lng
 * @property {string} note
 */

/**
 * @typedef {Object} Hospital
 * @property {string} code
 * @property {string} name
 * @property {number} lat
 * @property {number} lng
 * @property {string} note
 */

/**
 * @typedef {Object} GeocodeCandidate 地址查詢結果
 * @property {string} label 顯示名稱
 * @property {number} lat
 * @property {number} lng
 * @property {boolean} precise false 表示只找到路段／村里等概略位置，需在地圖確認
 * @property {string} source 查詢來源
 */

/**
 * @typedef {Object} PlannerSettings
 * @property {number} bPrepMinutes B 分隊接獲通知到出發的準備時間
 * @property {number} tieThresholdMinutes 碰頭時間相差在此分鐘內，改以送醫總時間較短者優先
 * @property {number} openDataTimeFactor 開放圖資（無路況）行車時間倍率，用於校正山路
 */

/**
 * @typedef {Object} Dataset
 * @property {Station[]} stations
 * @property {TransferPoint[]} transferPoints
 * @property {Hospital[]} hospitals
 * @property {PlannerSettings} settings
 * @property {string[]} warnings 資料檢查發現的問題（略過的列等）
 * @property {"sheet"|"sample"} source
 */

/**
 * @typedef {Object} RoutingProviderInfo
 * @property {string} id
 * @property {string} label 顯示給使用者的名稱
 * @property {boolean} hasLiveTraffic
 */

/**
 * @typedef {Object} MatrixResult 行車時間矩陣，[起點索引][終點索引]；無法到達為 null
 * @property {(number|null)[][]} durationsSec
 * @property {(number|null)[][]} distancesM
 * @property {RoutingProviderInfo} provider
 * @property {string[]} failures 前面嘗試失敗的服務與原因
 */

/**
 * @typedef {Object} CandidateLegs 單一接駁點的三段行車資料
 * @property {TransferPoint} point
 * @property {number|null} sceneToPointSec 現場（A）→ 接駁點
 * @property {number|null} bToPointSec B 分隊 → 接駁點（不含準備時間）
 * @property {number|null} pointToHospitalSec 接駁點 → 醫院
 * @property {number|null} sceneToPointM
 * @property {number|null} bToPointM
 * @property {number|null} pointToHospitalM
 */

/**
 * @typedef {Object} RankedCandidate
 * @property {TransferPoint} point
 * @property {number} aArriveSec A 抵達接駁點所需秒數
 * @property {number} bArriveSec B 抵達接駁點所需秒數（含準備時間）
 * @property {number} meetSec 兩隊碰頭所需秒數
 * @property {number} pointToHospitalSec
 * @property {number} totalSec 現在起到送達醫院的秒數
 * @property {"A"|"B"|null} waitingTeam 先到、需等待的一方
 * @property {number} waitSec
 * @property {boolean} recommended
 * @property {CandidateLegs} legs 原始三段行車資料（含距離）
 */

/**
 * @typedef {Object} PlanResult
 * @property {RankedCandidate[]} ranked 依建議順序排列
 * @property {TransferPoint[]} unreachable 無法算出路線的接駁點
 * @property {RoutingProviderInfo[]} providers 本次實際使用的路線服務
 * @property {string[]} failures
 * @property {Date} computedAt
 */

export {};
