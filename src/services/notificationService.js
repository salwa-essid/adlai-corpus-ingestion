async function notifyDiff(diff) {
    console.log(
        `[NOTIFICATION] Document diff detected for source ${diff.sourceId}`
    );

    return true;
}

module.exports = {
    notifyDiff
};