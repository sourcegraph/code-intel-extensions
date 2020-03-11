/**
  * API service definition for Apache Thrift.
  *
  * By Thanh Nguyen <btnguyen2k@gmail.com>
  * Since template-v0.1.4
  */

/**
  * $ rm -rf gen-java && thrift --gen java api_service.thrift
  */

namespace java thrift.def

enum TDataEncodingType {
    JSON_STRING = 0,  // Data is encoded as JSON string
    JSON_GZIP   = 1   // Data is encoded as gzipped JSON string
}

struct TApiAuth {
    1: optional string apiKey      = "",
    2: optional string accessToken = ""
}

struct TApiParams {
    1: optional TDataEncodingType dataType = TDataEncodingType.JSON_STRING,
    2: optional binary paramsData,
    3: optional TDataEncodingType expectedReturnDataType = TDataEncodingType.JSON_STRING
}

struct TApiResult {
    1: i32 status,
    2: optional string message,
    3: optional TDataEncodingType dataType = TDataEncodingType.JSON_STRING,
    4: optional binary resultData,
    5: optional binary debugData
}

service TApiService {
    /**
      * This method is to test if server is online.
      */
    void ping(),

    /**
      * This method is to test if server is online.
      */
    TApiResult check(1:TApiAuth apiAuth),

    /**
      * Invoke API call.
      */
    TApiResult callApi(1:TApiAuth apiAuth, 2:string apiName, 3:TApiParams apiParams)
}
