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
        // 官方响应为 { success: boolean, data: { url, ... } }，兼容旧版 { status_code, image: { url } } 结构
        if (uploadResponse.success === false) {
          throw new Error(`上传失败: ${uploadResponse.message || uploadResponse.error || '未知错误'}`)
        }
        // // 保存结果（多路径兜底兼容不同响应结构）
        const rawUrl = uploadResponse?.data?.url || uploadResponse?.data?.image?.url ||
          uploadResponse?.data?.links?.url || uploadResponse?.image?.url
        if (!rawUrl) {
          throw new Error('IM.GE图床返回的URL为空')
        }
        img.imgUrl = rawUrl
        img.fullResult = uploadResponse
      }
      return true
    } catch (err: any) {
      ctx.log.error('IM.GE图床上传失败', err)
      ctx.emit('notification', {
        title: 'IM.GE图床错误',
        body: err.message || '未知错误'
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
