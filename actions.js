const debug = require("debug")("action-dashboard:actions");
const _ = require("lodash");
const dayjs = require("dayjs");
const pLimit = require("p-limit");
const dataForge = require('data-forge');
const { default: axios } = require("axios");
require('data-forge-fs');
class Actions {
  constructor(gitHub, runStatus, lookbackDays) {
    this._gitHub = gitHub;
    this._runStatus = runStatus;
    // Cache all workflows to speed up refresh
    this._runs = [];
    this._scores = [];
    this._refreshingRuns = false;
    this._lookbackDays = lookbackDays;
  }

  start() {
    debug("Performing initial refreshRuns");
    // Load the initial set
    this.refreshRuns();

    debug("Setting interval to refreshRuns at 15m");
    // Refresh by default every fifteeen minutes
    setInterval(this.refreshRuns, 1000 * 60 * 15);
  }

  async getMostRecentRuns(repoOwner, repoName, workflowId) {
    try {
      const daysAgo = dayjs().subtract(this._lookbackDays, "day");
      const runs = await this._gitHub.listWorkflowRuns(
        repoOwner,
        repoName,
        workflowId
      );
      if (runs.length > 0) {
        const groupedRuns = _.groupBy(runs, "head_branch");
        const rows = _.reduce(
          groupedRuns,
          (result, runs, branch) => {
            debug(`branch`, branch);
            if (daysAgo.isBefore(dayjs(runs[0].created_at))) {
              debug(`adding run.id: ${runs[0].id}`);
              result.push({
                runId: runs[0].id,
                repo: runs[0].repository.name,
                owner: repoOwner,
                workflowId: workflowId,
                runNumber: runs[0].run_number,
                workflow: runs[0].name,
                branch: runs[0].head_branch,
                sha: runs[0].head_sha,
                message: runs[0].head_commit.message,
                committer: runs[0].head_commit.committer.name,
                status:
                  runs[0].status === "completed"
                    ? runs[0].conclusion
                    : runs[0].status,
                createdAt: runs[0].created_at,
                updatedAt: runs[0].updated_at,
              });
            } else {
              debug(
                `skipping run.id: ${runs[0].id} created_at: ${runs[0].created_at}`
              );
            }

            return result;
          },
          []
        );

        debug(
          `getting duration of runs owner: ${repoOwner}, repo: ${repoName}, workflowId: ${workflowId}`
        );

        // Get durations of runs
        const limit = pLimit(10);
        const getUsagePromises = rows.map((row) => {
          return limit(async () => {
            const usage = await this._gitHub.getUsage(
              repoOwner,
              repoName,
              workflowId,
              row.runId
            );
            if (usage?.run_duration_ms) {
              row.durationMs = usage.run_duration_ms;
            }

            return row;
          });
        });

        const rowsWithDuration = await Promise.all(getUsagePromises);

        debug(
          `most recent runs owner: ${repoOwner}, repo: ${repoName}, workflowId: ${workflowId}`,
          rowsWithDuration
        );
        return rows;
      } else {
        return [];
      }
    } catch (e) {
      console.error("Error getting runs", e);
      return [];
    }
  }

  mergeRuns(runs) {
    // Merge into cache
    runs.forEach((run) => {
      debug(`merging run`, run);
      const index = _.findIndex(this._runs, {
        workflowId: run.workflowId,
        branch: run.branch,
      });
      if (index >= 0) {
        this._runs[index] = run;
      } else {
        this._runs.push(run);
      }
      this._runStatus.updatedRun(run);
    });

    debug("merged runs", this._runs);
  }

  refreshRuns = async () => {
    // Prevent re-entrant calls
    if (this._refreshingRuns) {
      return;
    }

    debug("Starting refreshing runs");
    try {
      this._refreshingRuns = true;
      const repos = await this._gitHub.listRepos();
      for (const repo of repos) {
        debug(`repo: ${repo.name}`);
        const workflows = await this._gitHub.listWorkflowsForRepo(
          repo.name,
          repo.owner.login
        );
        if (workflows.length > 0) {
          for (const workflow of workflows) {
            debug(`workflow: ${workflow.name}`);
            const runs = await this.getMostRecentRuns(
              repo.owner.login,
              repo.name,
              workflow.id
            );
            // Not using apply or spread in case there are a large number of runs returned
            this.mergeRuns(runs);
          }
        }
      }
    } catch (e) {
      console.error("Error getting initial data", e);
    } finally {
      debug("Finished refreshing runs");
      this._runStatus.unloadDataTable()
      this._refreshingRuns = false;
    }
  };

  async refreshWorkflow(repoOwner, repoName, workflowId) {
    const runs = await this.getMostRecentRuns(repoOwner, repoName, workflowId);
    this.mergeRuns(runs);
  }

  getInitialData() {
    debug(`getInitialData this._runs.length: ${this._runs.length}`);
    if (this._runs.length === 0 && !this._refreshingRuns) {
      debug("getInitialData calling refreshRuns");
      this.refreshRuns();
    }

    return this._runs;
  }

  refreshRuns() {
    this.refreshRuns();
    return this._runs;
  }


  async downloadArtifact(repoOwner, repoName, artifactId) { 
    const artifact = await this._gitHub.downloadWorflowArtifact(repoOwner, repoName, artifactId);
    return artifact; 
  }

  async downloadWorkflowRunArtifact(repoOwner, repoName, runId) { 
      const runArtifacts = await this._gitHub.listWorkflowRunArtifacts(repoOwner, repoName, runId);
      return runArtifacts; 
  }

  async getCVEScore(data) {
    let scores = []
    for (const vuln of data) {
      const res = await axios.get(`https://services.nvd.nist.gov/rest/json/cve/1.0/${vuln}?apiKey=5cb1bbbd-9b0f-487e-a7db-06f642f91a5a`)
      scores.push(res.data.result.CVE_Items[0].impact.baseMetricV3.cvssV3.baseSeverity)
    }

    return scores
  }
  getReportData(runId) { 
    const result = {};
    let data = dataForge.readFileSync('/tmp/arvos-report.csv').parseCSV().renameSeries(
      { "ID": "id",
        "Vulnerability": "vulnerability",
        "Vulnerability Detail": "detail",
        "Score": "score",
        "Description": "description",
        "Invoked Class": "class",
        "Invoked Method": "method",
        "Package name": "package",
        "Github Repository": "repo",
        "Package manager": "manager",
        "Version range": "range",
        "Stacktrace": "stacktrace"
      })

    result.vulns = data.toArray();
    result.vulns_count = data.getSeries('vulnerability').distinct().count();
    result.symbols_count = data.count()
    result.vuln_packages = data.getSeries('package').distinct().count()

    const sumObjectsByKey = (...objs) => {
      const res = objs.reduce((a, b) => {
          for (let k in b) {
            if (b.hasOwnProperty(k))
            a[k] = (a[k] || 0) + b[k];
          }
          return a;
      }, {});
      return res;
    }

    let scoreCountInit = {'CRITICAL':0, 'HIGH': 0, 'MEDIUM': 0, 'LOW':0}
    let uniqVulns = data.distinct(vuln => vuln.vulnerability)
    let arr = uniqVulns.getSeries('score').toArray()
    var scoreCount = arr.reduce((acc, val) => {
      acc[val] = acc[val] === undefined ? 1 : acc[val] += 1;
      return acc;
    }, {});
    
    let scores = sumObjectsByKey(scoreCountInit, scoreCount )
    result.pieData = [scores['CRITICAL'], scores['HIGH'], scores['MEDIUM'], scores['LOW']]

    return result;
  }

}

module.exports = Actions;
