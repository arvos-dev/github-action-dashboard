<template>
    <v-container :fluid="true">
        <v-data-table
            :headers="headers"
            :items="runs"
            item-key="name"
            class="elevation-1"
            :search="search"
            :custom-filter="filterOnlyCapsText"
            :disable-pagination="true"
            :hide-default-footer="true"
            :loading="loading"
            loading-text="Loading runs..."
            sort-by="createdAt"
            :sort-desc="true"
        >
            <template v-slot:top>
                <v-text-field v-model="search" label="Search" class="mx-4"></v-text-field>
            </template>
            <template v-slot:item.workflow="{ item }">
                <a :href="`https://github.com/${item.owner}/${item.repo}/actions?query=workflow%3A${item.workflow}`" target="_blank">{{ item.workflow }}</a>
            </template>
            <template v-slot:item.message="{ item }">
                <a :href="`https://github.com/${item.owner}/${item.repo}/actions/runs/${item.runId}`" target="_blank">{{ item.message }}</a>
            </template>
            <template v-slot:item.sha="{ item }">
                <a :href="`https://github.com/${item.owner}/${item.repo}/commit/${item.sha}`" target="_blank">{{ item.sha.substr(0, 8) }}</a>
            </template>

            <template v-slot:item.status="{ item }">
                <v-chip :color="getColor(item.status)">
                    {{ item.status }}
                </v-chip>
            </template>

            <template v-slot:item.createdAt="{ item }">
                <div>
                    <div>{{ item.createdAt | formattedDate }}</div>
                    <div>{{item.createdAt | formattedTime}}</div>
                </div>
            </template>

            <template v-slot:item.durationMs="{ item }">
                {{ item.durationMs | formattedDuration }}
            </template>

            <template v-slot:item.actions="{ item }">
                <v-tooltip bottom>
                    <template v-slot:activator="{ on, attrs }">
                        <v-icon large color="green darken-2" v-bind="attrs" v-on="on" @click="refreshRun(item)"> mdi-refresh </v-icon>
                    </template>
                    <span>Refresh</span>
                </v-tooltip>
                <v-tooltip bottom>
                    <template v-slot:activator="{ on, attrs }">
                        <v-icon large color="purple darken-2" v-bind="attrs" v-on="on"  @click="showReport(item)"> mdi-chart-pie </v-icon>
                    </template>
                    <span>Report</span>
                </v-tooltip>
            </template>
        </v-data-table>
        <v-dialog
            v-model="loadingDialog"
            hide-overlay
            persistent
            width="300"
            >
            <v-card
                color="primary"
                dark
            >
                <v-card-text class="py-5">
                Please stand by
                <v-progress-linear
                    indeterminate
                    color="white"
                    class="mb-0"
                ></v-progress-linear>
                </v-card-text>
            </v-card>
        </v-dialog>
        <v-dialog
            transition="dialog-bottom-transition"
            max-width="600"
            v-model="errorDialog"
        >
            <v-card>
                <v-toolbar color="red" class="white--text" >
                    Message
                    <v-spacer></v-spacer>
                    <v-btn icon @click="errorDialog = false">
                        <v-icon color="white">mdi-close</v-icon>
                    </v-btn>
                </v-toolbar>
                <v-card-text>
                    <div class="text-h5 pa-12">Arvos scan has not been detected on this branch.</div>
                </v-card-text>
            </v-card>
        </v-dialog>
        <v-dialog
            v-model="dialog"
            fullscreen
            hide-overlay
            transition="dialog-bottom-transition"
        >
            <v-card>
                <v-toolbar
                dark
                color="primary"
                >
                <v-btn
                    icon
                    dark
                    @click="dialog = false"
                >
                    <v-icon>mdi-close</v-icon>
                </v-btn>
                <v-toolbar-title>Arvos Dashboard >  {{ workflowBranch }}</v-toolbar-title>
                <v-spacer></v-spacer>
                </v-toolbar>
                <v-container class="mt-10">
                    <v-row>
                        <!-- <v-col cols="1"></v-col> -->
                        <v-col cols="3">
                                <v-card
                                color="#690b3d"
                                dark
                                height="200"
                            >
                                <v-card-title class="text-h1 font-weight-bold">
                                    {{ symbols_count }}
                                </v-card-title>
                                <v-card-subtitle class="text-h5">Symbols</v-card-subtitle>
                            </v-card>
                        </v-col>
                        <v-col cols="3">
                                <v-card
                                color="#C62828"
                                dark
                                height="200"
                            >
                                <v-card-title class="text-h1 font-weight-bold">
                                    {{ vulns_count }}
                                </v-card-title>
                                <v-card-subtitle class="text-h5">Vulnerabilites</v-card-subtitle>
                            </v-card>
                        </v-col>
                        <v-col cols="3">
                        <v-card
                            color="#00695C"
                            dark
                            height="200"
                        >
                            <v-card-title class="text-h1 font-weight-bold">
                            {{ vuln_packages  }}
                            </v-card-title>
                            <v-card-subtitle class="text-h5">Packages</v-card-subtitle>
                        </v-card>
                        </v-col>
                        <!-- <v-col cols="1"></v-col> -->
                        <v-col cols="3">
                            <Pie
                                :chart-options="chartOptions"
                                :chart-data="chartData"
                                :chart-id="chartId"
                                :dataset-id-key="datasetIdKey"
                                :plugins="plugins"
                                :css-classes="cssClasses"
                                :styles="styles"
                                height="200"
                            /> 
                        </v-col>
                    </v-row>

                    <v-data-table
                        :headers="tableheaders"
                        :items="vulns"
                        class="elevation-1 mt-10"
                        single-expand="true"
                        :expanded.sync="expanded"
                        show-expand
                        disable-sort
                    >
                        <template v-slot:item.repo="{ item }">
                            <a :href="`${item.repo}`" target="_blank">{{ item.repo | repoName }}</a> 
                        </template>
                    
                        <template v-slot:item.vulnerability="{ item }">
                            <a :href="`https://nvd.nist.gov/vuln/detail/${item.vulnerability}`" target="_blank">{{ item.vulnerability }}</a> 
                            <v-chip
                                :color="getCVEScore(item.score)"
                                dark
                                x-small
                                class="ml-1"
                            >
                            {{ item.score }}
                            </v-chip>
                        </template>
                        <template v-slot:expanded-item="{ headers, item }">
                            <td class="pa-5" :colspan="headers.length">
                                {{ item.description  }}
                            <v-divider class="mt-2"></v-divider>
                            <v-system-bar
                                window
                                dark
                                class="mt-3"
                                >
                                <v-icon>mdi-chevron-right</v-icon>
                                <span class="font-weight-bold">{{ item.stacktrace }}</span>
                                <v-spacer></v-spacer>
                            </v-system-bar>
                             
                            </td>
                        </template>
                    </v-data-table>
            </v-card>
        </v-dialog>
        <v-btn
            key="mdi-pencil"
            color="green"
            fab
            large
            bottom
            fixed
            right
            class="v-btn--example"
            @click="refreshRuns()"
        >
        <v-icon color="white">mdi-refresh</v-icon>
      </v-btn>
    </v-container>
</template>

<script>
import axios from "axios";
import findIndex from "lodash-es/findIndex";
import * as dayjs from "dayjs";
import duration from "dayjs/plugin/duration";
// import fs from "fs"
dayjs.extend(duration);
import { Pie } from 'vue-chartjs/legacy'

import {
  Chart as ChartJS,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  CategoryScale
} from 'chart.js'

ChartJS.register(Title, Tooltip, Legend, ArcElement, CategoryScale)

export default {
    name: 'PieChart',
    components: {
        Pie
    },
    props: {
        chartId: {
        type: String,
        default: 'pie-chart'
        },
        datasetIdKey: {
        type: String,
        default: 'label'
        },
        width: {
        type: Number,
        default: 200
        },
        height: {
        type: Number,
        default: 200
        },
        cssClasses: {
        default: '',
        type: String
        },
        styles: {
        type: Object,
        default: () => {}
        },
        plugins: {
        type: Array,
        default: () => []
        }
    },
    sockets: {
        updatedRun(run) {
            console.log("updatedRun runId: " + run.runId);
            const index = findIndex(this.runs, { workflowId: run.workflowId, branch: run.branch });
            if (index >= 0) {
                this.$set(this.runs, index, run);
            } else {
                this.runs.push(run);
            }
        },
        unloadDataTable() {
            this.loading = false
        }
    },
    mounted() {
        this.getData();
    },
    data() {
        return {
            tableheaders: [
                { text: 'ID', value: 'id', align: 'start' },
                { text: 'Vulnerability', value: 'vulnerability', sortable: true },
                { text: 'Invoked Class', value: 'class' },
                { text: 'Invoked Method', value: 'method' },
                { text: 'Package', value: 'package' },
                { text: 'Github Repo', value: 'repo' },
                { text: 'Version range', value: 'range' },
                { text: '', value: 'data-table-expand' },
                ],
            vulns: [],
            vulns_count: 0,
            symbols_count: 0,
            vuln_packages: 0,
            search: "",
            runs: [],
            workflowId: "",
            loading: false,
            dialog: false,
            loadingDialog: false,
            errorDialog: false,
            expanded: [],
            chartData: {
                labels: ['Critical', 'High', 'Medium', 'Low'],
                datasets: [
                    {
                        backgroundColor: ['#DD1B16', '#E46651', '#00D8FF', '#41B883'],
                        data: []
                    }
                ]
            },
            chartOptions: {
                responsive: false,
                maintainAspectRatio: false
            }
            }
    },
    computed: {
        headers() {
            return [
                { text: "Repository", align: "start", value: "repo" },
                { text: "Workflow", value: "workflow" },
                { text: "Branch", value: "branch" },
                { text: "Status", value: "status" },
                { text: "Commit", value: "sha" },
                { text: "Message", value: "message" },
                { text: "Committer", value: "committer" },
                { text: "Started", value: "createdAt", align: "right"},
                { text: "Duration", value: "durationMs", align: "right"},
                { text: "", value: "actions", sortable: false },
            ];
        },
    },
    filters: {
        formattedDate(val) {
            if(val) {
                return dayjs(val).format("YYYY-MM-DD");
            }
            else return val;
        },
        formattedTime(val) {
            if(val) {
                return dayjs(val).format("h:mm A")
            }
        },
        formattedDuration(val) {
            if(val) {
                let format = "";
                if(val >= 3.6e+6) {
                    format = "H[h] m[m] s[s]";
                }
                else if(val >= 60000 ) {
                    format = "m[m] s[s]";
                }
                else {
                    format = "s[s]";
                }
                return dayjs.duration(val).format(format);
            }
            else return val;
        },
        repoName(val) {
            return val.split('/').pop()
        }
    },
    methods: {
        getCVEScore (score) {
            switch (score) {
                case 'CRITICAL':
                    return '#DD1B16'
                case 'HIGH':
                    return '#E46651'
                case 'MEDIUM':
                    return '#00D8FF'
                case 'LOW':
                    return '#41B883'
                default:
                    return ''
            }
        },
        getData() {
            this.loading = true;
            axios
                .get("/api/initialData")
                .then((result) => {
                    console.log("getData results");
                    this.runs = result.data;
                })
                .catch((err) => {
                    console.log("getData error");
                    console.error(err);
                })
                .finally(() => {
                    console.log("getData finally");
                    this.loading = false;
                });
        },
        refreshRuns() {
            this.runs = []
            this.loading = true
            axios
                .get("/api/refreshRuns")
                .then(() => {
                    // this.loading = false
                })
        },
        refreshRun(run) {
            // This
            run.status = "Refreshing";
            // Get all new runs for workflow_id
            axios.get(`/api/runs/${run.owner}/${run.repo}/${run.workflowId}`).catch((err) => {
                console.log("refreshRun", err);
            });
        },
        showReport(run) { 
            // this.dialog = true 
            this.loadingDialog = true 
            let self = this
            axios.get(`/api/downloadReport/${run.owner}/${run.repo}/${run.runId}`)
                .then((r) => {
                    if (r.data) {
                        axios.get(`/api/showReport/${run.runId}`).then((res) => {
                            self.vulns = res.data.vulns
                            self.vulns_count = res.data.vulns_count
                            self.symbols_count = res.data.symbols_count
                            self.vuln_packages = res.data.vuln_packages
                            self.chartData.datasets[0].data = res.data.pieData
                            self.workflowBranch = run.branch
                            this.loadingDialog = false
                            this.dialog = true
                        })
                    } else {
                        this.loadingDialog = false
                        this.errorDialog = true
                    }
                }).catch(err => console.log(err))
        },
        filterOnlyCapsText(value, search) {
            return value != null && search != null && typeof value === "string" && value.toString().indexOf(search) !== -1;
        },
        getColor(status) {
            switch (status) {
                case "success":
                    return "green";

                case "failure":
                    return "red";

                case "in_progress":
                case "queued":
                    return "yellow";

                default:
                    return "transparent";
            }
        },
    },
};
</script>

<style lang="scss">
.v-data-table-header { 
    th {
        white-space: nowrap;
    }

    th:nth-child(8) {
        min-width: 120px;
    }
}
</style>