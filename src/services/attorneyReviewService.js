const {
    saveAttorneyReview
} = require("../repositories/attorneyReviewRepository")
async function reviewQuery(data) {
    return saveAttorneyReview(data);
}
module.exports = {
    reviewQuery
}