use serde::{Serialize, Serializer};

/// 앱 공통 에러. invoke 반환 시 문자열로 직렬화되어 프론트 catch로 전달된다.
#[derive(thiserror::Error, Debug)]
pub enum AppError {
    #[error("쿠팡 API 오류: {0}")]
    Coupang(String),
    #[error("DB 오류: {0}")]
    Db(String),
    #[error("설정 누락: {0}")]
    Config(String),
    #[error("크롤링 실패: {0}")]
    Crawl(String),
    #[error("{0}")]
    Other(String),
}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

impl From<rusqlite::Error> for AppError {
    fn from(e: rusqlite::Error) -> Self {
        AppError::Db(e.to_string())
    }
}

impl From<reqwest::Error> for AppError {
    fn from(e: reqwest::Error) -> Self {
        AppError::Coupang(e.to_string())
    }
}
