function formatMessage(doc) {
  const o = doc.toObject ? doc.toObject() : doc;
  return {
    id: o._id,
    projectId: o.project,
    author: o.author
      ? {
          id: o.author._id,
          nickname: o.author.nickname || o.author.username,
        }
      : null,
    type: o.type,
    body: o.body,
    summary: o.summary,
    githubUrl: o.githubUrl,
    taskPageUrl: o.taskPageUrl,
    linkedTask: o.linkedTask,
    githubMeta: o.githubMeta,
    summaryViaGroq: o.githubMeta?.summaryViaGroq === true,
    reviewCompleted: o.reviewCompleted,
    createdAt: o.createdAt,
  };
}

module.exports = { formatMessage };
