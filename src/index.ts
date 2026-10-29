import { PicGo } from 'picgo'
import { IPluginConfig  } from 'picgo/dist/utils/interfaces'
import { URL } from 'url'

// Define the IWechatConfig interface according to your config structure
const CONFIG_NAME = 'picgo-plugin-im.ge-uploader'

interface ImgeConfig {
  apiKey: string
  imageMaxSize: number
}

// 常见图片扩展名 -> MIME 类型映射，用于 multipart 上传时的 contentType 声明
const MIME_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp'
}

export = (ctx: PicGo) => {

  const config = (): IPluginConfig[] => {
    return [
      {
        name: 'apiKey',
        type: 'input',
        message: 'IM.GE API Key',
        required: true
      },
      {
        name: 'imageMaxSize',
        type: 'input',
        default: '5',
        message: '图片大小限制（MB，微信上限为10MB）',
        required: false
      }
    ]
  }
  const handleUpload = async (ctx: PicGo): Promise<boolean> => {
    try {
      const userConfig = ctx.getConfig<ImgeConfig>(`picBed.${CONFIG_NAME}`)
      if (!userConfig) {
        throw new Error('未获取到IM.GE图床配置')
      }
      const { apiKey, imageMaxSize = 5 } = userConfig


      // 处理所有图片
      for (const img of ctx.output) {
        // 检查图片大小
        const imageSizeMB = img.buffer.length / (1024 * 1024)
        if (imageSizeMB > imageMaxSize) {
          throw new Error(`图片大小 ${imageSizeMB.toFixed(2)}MB 超过限制 ${imageMaxSize}MB`)
        }
        
        // 上传到IMGE
        ctx.log.info('upload :', img.fileName, img.extname, img.buffer.length, 'bytes');
        // Content-Type 由 request 库根据 formData 自动生成（带 boundary），无需手动设置
        const mimeType = MIME_MAP[(img.extname || '').toLowerCase()] || 'image/jpeg'
        const uploadResponse:any = await ctx.request({
          url: `https://im.ge/api/v1/upload`,
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`
          },
          // Cloudflare 可能返回 308 重定向，request 库默认不跟随 POST 的 308，需显式开启
          followAllRedirects: true,
          formData: {
            file: {
              value: img.buffer,
              options: {
                filename: img.fileName,
                contentType: mimeType
              }
            }
          },
          json: true
        })
        ctx.log.info('IM.GE图床上传响应',uploadResponse)
        // 官方响应为 { success: boolean, data: { ... } }，data.url 是查看器页面而非图片直链
        // 直链在 direct_url / cdn_url / image.url（i.im.ge 域名）
        if (uploadResponse.success === false) {
          throw new Error(`上传失败: ${uploadResponse?.error?.message || uploadResponse.message || '未知错误'}`)
        }
        // // 保存结果（直链优先，查看器页面兜底）
        const rawUrl = uploadResponse?.data?.direct_url || uploadResponse?.data?.cdn_url ||
          uploadResponse?.data?.image?.url || uploadResponse?.image?.url || uploadResponse?.data?.url
        if (!rawUrl) {
          throw new Error('IM.GE图床返回的URL为空')
        }
        img.imgUrl = rawUrl
        img.fullResult = uploadResponse
      }
      return true
    } catch (err: any) {
      // request-promise 对非 2xx 抛出 StatusCodeError，err.error 为响应体（json:true 时已解析）
      const respBody = err?.error
      const detail = respBody?.error?.details?.errors?.[0]?.error
      let msg = detail || respBody?.error?.message || respBody?.message || err?.message || '未知错误'
      // im.ge 有最小图片限制（防滥用），过小的图片会被整体拒绝
      if (detail === 'Upload rejected') {
        msg += '（im.ge 会拒绝过小的图片，请确认图片正常后重试）'
      }
      ctx.log.error('IM.GE图床上传失败', err)
      ctx.emit('notification', {
        title: 'IM.GE图床错误',
        body: msg
      })
      return false
    }
  }

  

  const handleAfterUpload = async (ctx: PicGo): Promise<boolean> => {
    try {
      // afterUploadPlugins 对所有图床都会执行，仅在当前使用本图床时才处理，避免改写其他图床的上传结果
      const currentUploader = ctx.getConfig<string>('picBed.uploader') || ctx.getConfig<string>('picBed.current')
      if (currentUploader !== CONFIG_NAME) {
        return true
      }
      ctx.log.info('IM.GE图床上传完成')
      // 为本图床的上传结果补充 Markdown 格式字段
      for (const img of ctx.output) {
        if (img.imgUrl) {
          img.markdown = `![](${img.imgUrl})`
          ctx.log.info('IM.GE图床上传完成，图片URL:', img.imgUrl)
        }
      }
    } catch (err: any) {
      ctx.log.error('上传后处理失败', err)
    }
    return true
  }

  const register = (): void => {
    ctx.helper.uploader.register(CONFIG_NAME, {
      name: 'IM.GE图床',
      handle: handleUpload,
      config: config,
      
    })
    // 不注册 transformer：使用默认 transformer（path）即可读取本地图片，避免选到空 transformer 导致上传失败
    ctx.helper.beforeTransformPlugins.register(CONFIG_NAME, {
      handle (ctx) {

      }
    })
    ctx.helper.beforeUploadPlugins.register(CONFIG_NAME, {
      handle (ctx) {

      }
    })
    ctx.helper.afterUploadPlugins.register(CONFIG_NAME, {
      handle: handleAfterUpload
    })
  }
  return {
    uploader: CONFIG_NAME,
    register
  }
}
