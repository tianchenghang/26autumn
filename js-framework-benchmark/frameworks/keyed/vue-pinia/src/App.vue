<script setup>
import { useStore } from "./store";

const store = useStore();
const run = store.run;
const runlots = store.runlots;
const add = store.add;
const update = store.update;
const clear = store.clear;
const swaprows = store.swaprows;
const select = store.select;
const remove = store.remove;
</script>

<template>
  <div class="jumbotron">
    <div class="row">
      <div class="col-md-6">
        <h1>Vue.js 3 Pinia (keyed)</h1>
      </div>
      <div class="col-md-6">
        <div class="row">
          <div class="col-sm-6 smallpad">
            <button type="button" class="btn btn-primary btn-block" id="run" @click="run">Create 1,000 rows</button>
          </div>
          <div class="col-sm-6 smallpad">
            <button type="button" class="btn btn-primary btn-block" id="runlots" @click="runlots">
              Create 10,000 rows
            </button>
          </div>
          <div class="col-sm-6 smallpad">
            <button type="button" class="btn btn-primary btn-block" id="add" @click="add">Append 1,000 rows</button>
          </div>
          <div class="col-sm-6 smallpad">
            <button type="button" class="btn btn-primary btn-block" id="update" @click="update">
              Update every 10th row
            </button>
          </div>
          <div class="col-sm-6 smallpad">
            <button type="button" class="btn btn-primary btn-block" id="clear" @click="clear">Clear</button>
          </div>
          <div class="col-sm-6 smallpad">
            <button type="button" class="btn btn-primary btn-block" id="swaprows" @click="swaprows">Swap Rows</button>
          </div>
        </div>
      </div>
    </div>
  </div>
  <table class="table-hover table-striped test-data table">
    <tbody>
      <tr
        v-for="{ id, label } of store.rows"
        :key="id"
        :class="{ danger: id === store.selected }"
        :data-label="label"
        v-memo="[label, id === store.selected]"
      >
        <td class="col-md-1">{{ id }}</td>
        <td class="col-md-4">
          <a @click="select(id)">{{ label }}</a>
        </td>
        <td class="col-md-1">
          <a @click="remove(id)">
            <span class="glyphicon glyphicon-remove" aria-hidden="true"></span>
          </a>
        </td>
        <td class="col-md-6"></td>
      </tr>
    </tbody>
  </table>
  <span class="preloadicon glyphicon glyphicon-remove" aria-hidden="true"></span>
</template>
