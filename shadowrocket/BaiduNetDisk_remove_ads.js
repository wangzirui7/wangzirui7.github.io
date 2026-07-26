/**
 * 百度网盘首页入口净化 - Shadowrocket
 * 删除 feed/kingkongdistrict 返回数据中 type 为
 * novel / shortplay / print / job_hunt 的项目。
 */

const blockedTypes = new Set(["novel", "shortplay", "print", "job_hunt"]);

try {
  const data = JSON.parse($response.body);

  if (data && data.data && Array.isArray(data.data.data)) {
    data.data.data = data.data.data.filter(
      item => !item || !blockedTypes.has(item.type)
    );
  }

  $done({ body: JSON.stringify(data) });
} catch (error) {
  console.log(`[BaiduNetDisk] JSON 处理失败: ${error}`);
  $done({});
}
