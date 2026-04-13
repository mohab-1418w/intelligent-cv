# API Endpoints

Total Endpoints: 21

## Health (1 endpoint)
| Method | URL                    |
|--------|------------------------|
| GET    | /health                |

## HR (8 endpoints)
| Method | URL                    |
|--------|------------------------|
| POST   | /hr/registration       |
| POST   | /hr/login              |
| POST   | /hr/logout             |
| POST   | /hr/add-post           |
| GET    | /hr/get-posts          |
| GET    | /hr/rank-candidates    |
| PUT    | /hr/update-post        |
| DELETE | /hr/delete-post        |

## Candidate (8 endpoints)
| Method | URL                        |
|--------|----------------------------|
| POST    /candidate/registration    |
| POST    /candidate/login           |
| POST    /candidate/logout          |
| GET     /candidate/get-posts       |
| POST    /candidate/upload-resume   |
| POST    /candidate/submit-application |
| POST    /candidate/score-resume    |
| POST    /candidate/chat            |

## User / Email Confirmation (3 endpoints)
| Method | URL                              |
|--------|----------------------------------|
| POST   | /user/send-confirmation-code     |
| POST   | /user/send-confiramtion-code     |
| PUT    | /user/email-confirmation         |

## Files (1 endpoint)
| Method | URL              |
|--------|------------------|
| GET    | /files/:file_id  |
