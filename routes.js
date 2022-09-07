const debug = require("debug")("action-dashboard:routes");

class Routes {
  constructor(actions, owner) {
    this._owner = owner;
    this._actions = actions;
  }

  attach(router) {
    router.get("/owner", (req, res, next) => {
      debug(`/owner ${this._owner}`);
      res.send(this._owner);
    });

    router.get("/initialData", (req, res, next) => {
      const initialData = this._actions.getInitialData();
      res.send(initialData);
    });

    router.get("/downloadReport/:owner/:repo/:run_id", (req, res, next) => {
      this._actions.downloadWorkflowRunArtifact(req.params.owner, req.params.repo, req.params.run_id)
        .then((artifacts) => { 
          res.send(artifacts);
        })
    });

    router.get("/showReport/:run_id", (req, res, next) => {
      const data = this._actions.getReportData(req.params.run_id)
      res.send(data); 
    })

    router.get("/downloadArtifact/:owner/:repo/:artifact_id", (req, res, next) => {
      this._actions.downloadArtifact(req.params.owner, req.params.repo, req.params.artifact_id);
      res.send();
    })

    router.get("/runs/:owner/:repo/:workflow_id", (req, res, next) => {
      this._actions.refreshWorkflow(
        req.params.owner,
        req.params.repo,
        parseInt(req.params.workflow_id)
      );
      res.send();
    });
  }
}

module.exports = Routes;
