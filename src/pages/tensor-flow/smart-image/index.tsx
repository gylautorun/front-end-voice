import {useState, useRef, useEffect, useCallback} from 'react';
// 导入
import * as tf from '@tensorflow/tfjs';
import * as mobileNet from '@tensorflow-models/mobilenet'; 
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import * as poseNet from '@tensorflow-models/posenet';
import { Card, Alert, Spin, Row, Col } from 'antd';
import style from './style.module.scss';

type CocoSsdModel = Awaited<ReturnType<typeof cocoSsd.load>>;
interface DetectionResultItem {
  class: string;
  bbox: number[];
  score: number;
}
interface PoseResultItem {
  keypoints: poseNet.Keypoint[];
  score: number;
}

export default function SmartImage() {
  const [image, setImage] = useState('');
  const [loading, setLoading] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasPoseRef = useRef<HTMLCanvasElement>(null);

  // 预训练模型进行图像分类
  const mobileNetModelRef = useRef<mobileNet.MobileNet | null>(null);
  const [predictions, setPredictions] = useState<{className: string, probability: number}[]>([]);

  // Coco-SSD 进行物体检测
  const cocoSsdModelRef = useRef<CocoSsdModel | null>(null);
  const [detectionResults, setDetectionResults] = useState<DetectionResultItem[]>([]);

  // PoseNet 进行姿态估计
  const poseNetModelRef = useRef<poseNet.PoseNet | null>(null);
  const [poseResult, setPoseResult] = useState<PoseResultItem>({keypoints: [], score: 0});
  

  // 模型推理
  useEffect(() => {
    // 绘制姿态估计骨架图
    const drawPose = (keypoints: poseNet.Keypoint[], image: HTMLImageElement) => {
      const canvas = canvasPoseRef.current;
      const ctx = canvas?.getContext('2d');
      if (!ctx || !canvas) {
        return;
      }
      const imageWidth = image.width;
      const imageHeight = image.height;
      canvas.width = imageWidth;
      canvas.height = imageHeight;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // 绘制图像
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const scaleX = canvas.width / image.width;
      const scaleY = canvas.height / image.height;
      // 绘制关键点并标记名称
      keypoints.forEach((point) => {
        const { x, y } = point.position;
        const scaledX = x * scaleX;
        const scaledY = y * scaleY;
        ctx.beginPath();
        ctx.arc(scaledX, scaledY, 5, 0, 2 * Math.PI);
        ctx.fillStyle = 'red';
        ctx.fill();
        // 标记点的名称
        ctx.font = '12px Arial';
        ctx.fillStyle = 'blue';
        ctx.fillText(point.part, scaledX + 8, scaledY);
        })
      // 连接骨架
      const poseConnections = [
        ['leftShoulder', 'rightShoulder'],
        ['leftShoulder', 'leftElbow'],
        ['leftElbow', 'leftWrist'],
        ['rightShoulder', 'rightElbow'],
        ['rightElbow', 'rightWrist'],
        ['leftHip', 'rightHip'],
        ['leftShoulder', 'leftHip'],
        ['rightShoulder', 'rightHip'],
        ['leftHip', 'leftKnee'],
        ['leftKnee', 'leftAnkle'],
        ['rightHip', 'rightKnee'],
        ['rightKnee', 'rightAnkle'],
        ['leftEye', 'rightEye'],
        ['leftEar', 'leftShoulder'],
        ['rightEar', 'rightShoulder']
      ];
      poseConnections.forEach(([partA, partB]) => {
        const keypointA = keypoints.find((point) => point.part === partA);
        const keypointB = keypoints.find((point) => point.part === partB);
        if (keypointA && keypointB && keypointA.score > 0.5 && keypointB.score > 0.5) {
          const scaledX1 = keypointA.position.x * scaleX;
          const scaledY1 = keypointA.position.y * scaleY;
          const scaledX2 = keypointB.position.x * scaleX;
          const scaledY2 = keypointB.position.y * scaleY;
          ctx.beginPath();
          ctx.moveTo(scaledX1, scaledY1);
          ctx.lineTo(scaledX2, scaledY2);
          ctx.lineWidth = 2;
          ctx.strokeStyle = 'blue';
          ctx.stroke();
        }
      });
    };

    // 绘制物体检测边界框
    const drawObjects = (detections: DetectionResultItem[], image: HTMLImageElement) => {
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        return;
      }
      const imageWidth = image.width;
      const imageHeight = image.height;
      canvas.width = imageWidth;
      canvas.height = imageHeight;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      // 绘制边界框
      detections.forEach((prediction) => {
        const [x, y, width, height] = prediction.bbox;
        ctx.beginPath();
        ctx.rect(x, y, width, height);
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'green';
        ctx.stroke();
        // 添加标签
        ctx.font = '16px Arial';
        ctx.fillStyle = 'green';
        ctx.fillText(prediction.class, x + 5, y + 20);
      });
    };

    // 模型推理
    const handleModel = async () => {
      // if (!mobileNetModelRef.current) {
      //   return;
      // }
      // if (!cocoSsdModelRef.current) {
      //   return;
      // }
      const [predictions, detections, poseResult] = await Promise.all([
        mobileNetModelRef.current?.classify(imageRef.current as HTMLImageElement),
        cocoSsdModelRef.current?.detect(imageRef.current as HTMLImageElement),
        poseNetModelRef.current?.estimateSinglePose(imageRef.current as HTMLImageElement, {
          flipHorizontal: false
        })
      ]);
      console.log('poseResult', {predictions, detections, poseResult});
      setPredictions(predictions || []);
      setDetectionResults(detections || []);
      setPoseResult(poseResult as poseNet.Pose);
      drawObjects(detections || [], imageRef.current as HTMLImageElement);
      drawPose(poseResult?.keypoints || [], imageRef.current as HTMLImageElement);
    };
    if (imageRef.current && image) {
      handleModel();
    }
  }, [image, imageRef, canvasRef, canvasPoseRef]);
  // 加载模型
  useEffect(() => {
    async function init() {
      try {
        setLoading(true);
        // 等待 TF.js 后端准备好
        await tf.ready(); // undefined, 判断是否后端已就绪
        // const backend = tf.getBackend(); // 获取当前已选定的后端名称
        // const _backend = tf.backend();
        // console.log('后端已就绪:', backend, _backend, tf);
        // const tensor = tf.tensor1d([1, 2, 3]);
        // tensor.print();
        // 加载 MobileNet 模型, Coco-SSD 模型, PoseNet 模型
        const [mobileNetModel, cocoModel, poseNetModel] = await Promise.all([
          mobileNet.load(),
          cocoSsd.load(),
          poseNet.load()
        ]);
        cocoSsdModelRef.current = cocoModel;
        mobileNetModelRef.current = mobileNetModel;
        poseNetModelRef.current = poseNetModel;
      } catch (error) {
        console.error('MobileNet 模型加载失败:', error);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);
  const handleInputUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (e: ProgressEvent<FileReader>) => {
        if (e.target) {
          setImage(e.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };
  return (
    <div className={style.smartImage}>
      <h1>SmartImage 页面</h1>
      <Spin spinning={loading} size="small">
        <Alert
          title={mobileNetModelRef.current ? 'MobileNet 模型已加载' : 'MobileNet 模型加载中'}
          type={mobileNetModelRef.current ? 'success' : 'info'}
        />
        <div className={style.uploadContainer}>
          <input type="file" onChange={handleInputUpload} />
          {image && <img src={image} alt="random image" ref={imageRef} />}
        </div>
        <Row gutter={16}>
          {predictions.map((item, index) => (
            <Col key={item.className} span={12}>
              <Card title={`分类&结果 ${index + 1}`}>
                <p>分类结果: {item.className}</p>
                <p>信心度: {item.probability.toFixed(3)}</p>
              </Card>
            </Col>
          ))}
        </Row>
        <Row gutter={16}>
          {detectionResults.map((item, index) => (
            <Col key={item.class} span={12}>
              <Card title={`检测结果 ${index + 1}`}>
                <p>物体: {item.class}</p>
                <p>位置: {item.bbox.join(', ')}</p>
                <p>得分: {item.score.toFixed(3)}</p>
              </Card>
            </Col>
          ))}
        </Row>
        <div className={style.imageContainer}>
          <canvas ref={canvasRef}></canvas>
          <canvas ref={canvasPoseRef}></canvas>
        </div>
      </Spin>
      
    </div>
  )
}
