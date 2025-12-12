import { PicGo } from 'picgo'
import { IPluginConfig  } from 'picgo/dist/utils/interfaces'
import { URL } from 'url'

// Define the IWechatConfig interface according to your config structure
const CONFIG_NAME = 'picgo-plugin-im.ge-uploader'

interface ImgeConfig {
  apiKey: string
  imageMaxSize: number
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
        const uploadResponse:any = await ctx.request({
          url: `https://im.ge/api/1/upload`,
          method: 'POST',
          headers: {
            'Content-Type': 'multipart/form-data',
            'X-API-Key': apiKey
          },
          formData: {
            source: {
              value: img.buffer,
              options: {
                filename: img.fileName,
                contentType: img.extname ? `image/${img.extname}` : 'image/jpeg'
              }
            },
            format: "json"
          },
          json: true
        }) 
        ctx.log.info('IM.GE图床上传响应',uploadResponse)
        if (uploadResponse.status_code !== 200) {
          throw new Error(`上传失败: ${uploadResponse.status_txt}`)
        }
        // // 保存结果
        img.imgUrl = uploadResponse.image.url
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

    try{
      const userConfig = ctx.getConfig<ImgeConfig>(`picBed.${CONFIG_NAME}`)
    // 这里可以处理上传后的逻辑，比如记录日志、发送通知等
      ctx.log.info('IM.GE图床上传完成')
      
      //将IM.GE原始URL转换为Markdown/CDN链接，通过afterUploadPlugins实现
      for (const img of ctx.output) {


        if (img.imgUrl) {
          // 应用CDN前缀解决防盗链问题
          let finalUrl = img.imgUrl
          
          // 这里假设你要将IM.GE URL转换为Markdown格式
          img.imgUrl = finalUrl
          img.markdown = `![](${img.imgUrl})`
          ctx.log.info('IM.GE图床上传完成，已应用CDN和Markdown转换')
        }
      }

    }catch(err: any) {
        ctx.log.error('上传后处理失败', err)
    }

     return true;
    }

  const register = (): void => {
    ctx.helper.uploader.register(CONFIG_NAME, {
      name: 'IM.GE图床',
      handle: handleUpload,
      config: config,
      
    })
    ctx.helper.transformer.register(CONFIG_NAME, {
      handle (ctx) {
        console.log(ctx)
        ctx.output.forEach((item) => {
          console.log('处理图片:', item.fileName)
        })
        
      }
    })
    ctx.helper.beforeTransformPlugins.register(CONFIG_NAME, {
      handle (ctx) {
        console.log(ctx)
      }
    })
    ctx.helper.beforeUploadPlugins.register(CONFIG_NAME, {
      handle (ctx) {
        console.log(ctx)
      }
    })
    ctx.helper.afterUploadPlugins.register(CONFIG_NAME, {
      handle : handleAfterUpload
    })
  }
  const commands = (ctx: PicGo) => [{
    label: '',
    key: '',
    name: '',
    async handle (ctx: PicGo, guiApi: any) {}
  }]
  return {
    uploader: CONFIG_NAME,
    transformer: CONFIG_NAME,
    commands,
    register
  }
}
