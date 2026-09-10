<script setup lang="ts">
import { NButton, NCard, NForm, NFormItem, NInput } from "naive-ui";
import { ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { authNotice, login, setAuthNotice } from "../auth";

const router = useRouter();
const route = useRoute();
const username = ref("");
const password = ref("");
const submitting = ref(false);
const error = ref(authNotice.value || "");

async function onSubmit() {
  error.value = "";
  setAuthNotice("");
  submitting.value = true;
  try {
    const message = await login(username.value.trim(), password.value);
    if (message) {
      error.value = message;
      return;
    }
    const redirect = typeof route.query.redirect === "string" ? route.query.redirect : "";
    await router.replace(redirect && redirect !== "/login" ? redirect : { name: "home" });
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="wrap">
    <n-card class="card" title="星卡 Admin">
      <p class="muted">用户名 / 密码登录（无微信扫码）</p>
      <n-form @submit.prevent="onSubmit">
        <n-form-item label="用户名">
          <n-input
            v-model:value="username"
            autocomplete="username"
            placeholder="用户名"
            :disabled="submitting"
            :input-props="{ name: 'username', id: 'login-username' }"
          />
        </n-form-item>
        <n-form-item label="密码">
          <n-input
            v-model:value="password"
            type="password"
            show-password-on="click"
            autocomplete="current-password"
            placeholder="密码"
            :disabled="submitting"
            :input-props="{ name: 'password', id: 'login-password' }"
          />
        </n-form-item>
        <n-button type="primary" attr-type="submit" block :loading="submitting" :disabled="submitting">
          登录
        </n-button>
        <p v-if="error" class="err" role="alert">{{ error }}</p>
      </n-form>
    </n-card>
  </div>
</template>

<style scoped>
.wrap {
  min-height: 100vh;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 12vh 16px 32px;
}

.card {
  width: 100%;
  max-width: 360px;
}

.muted {
  margin: 0 0 16px;
  color: var(--color-text-secondary);
  font-size: 13px;
}

.err {
  color: var(--color-danger);
  font-size: 13px;
  min-height: 18px;
  margin: 12px 0 0;
}
</style>
